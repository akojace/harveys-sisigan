// src/pages/POSPage.jsx
import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { menuApi, ordersApi, branchesApi } from '../api/client'
import { Button, EmptyState } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { getUserBranchId, resolveBranchId } from '../utils/branch'

// ─────────────────────────────────────────────────────────────────────────────
// ADDED — kiosk stylesheet. Inline style objects can't express :hover,
// -webkit-line-clamp, or media queries, so the fixed-grid / fixed-card-size
// requirements live here. Nothing here touches data or business logic.
// ─────────────────────────────────────────────────────────────────────────────
const kioskStyles = `
  input[type=number]::-webkit-outer-spin-button,
  input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
  input[type=number] { -moz-appearance: textfield; }

  html, body, #root { height: 100%; overflow: hidden; }

  .kiosk-shell {
    display: flex;
    height: calc(100vh - var(--nav-height));
    overflow: hidden;
  }

  /* ── Main column (category bar + grid) ────────────────────────────── */
  .kiosk-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-width: 0;
  }

  /* ── Category bar ─────────────────────────────────────────────────── */
  .kiosk-catbar {
    position: sticky;
    top: 0;
    z-index: 20;
    height: 72px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    background: #fff;
    border-bottom: 1px solid var(--border);
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    scrollbar-width: thin;
  }
  .kiosk-catbar::-webkit-scrollbar { height: 5px; }
  .kiosk-catbar::-webkit-scrollbar-thumb { background: var(--brown-100); border-radius: 10px; }

  .kiosk-chip {
    height: 48px;
    padding: 0 22px;
    border-radius: var(--radius-full);
    font-size: 14px;
    font-weight: 700;
    white-space: nowrap;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.12s ease, background 0.15s ease;
    flex-shrink: 0;
  }
  .kiosk-chip:active { transform: scale(0.96); }
  .kiosk-chip.inactive {
    background: var(--cream);
    color: var(--brown-700);
    border: 2px solid var(--border);
  }
  .kiosk-chip.inactive:hover { border-color: var(--brown-500); }
  .kiosk-chip.active {
    background: var(--brown-600);
    color: #fff;
    border: 2px solid var(--brown-600);
  }

  /* ── Product grid — the ONLY scroll area on the left ──────────────── */
  .kiosk-gridwrap {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px;
  }

  .kiosk-grid {
    display: grid;
    gap: 18px;
    grid-template-columns: repeat(2, 1fr); /* mobile: 2 columns */
  }
  @media (min-width: 768px) {
    .kiosk-grid { grid-template-columns: repeat(3, 1fr); } /* tablet: 3 columns */
  }
  @media (min-width: 992px) {
    .kiosk-grid { grid-template-columns: repeat(4, 1fr); } /* laptop: 4 columns */
  }
  @media (min-width: 1200px) {
    .kiosk-grid { grid-template-columns: repeat(5, 1fr); } /* desktop: 5 columns */
  }

  /* ── Product card — fixed dimensions, identical for every category ── */
  .kiosk-card {
    height: 340px;
    border-radius: 16px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0,0,0,0.08);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    cursor: pointer;
    user-select: none;
    position: relative;
    border: 2px solid transparent;
    transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
  }
  .kiosk-card:hover { transform: translateY(-4px); }
  .kiosk-card:active { transform: scale(0.98); }
  .kiosk-card.selected {
    border-color: var(--brown-500);
    box-shadow: 0 6px 20px rgba(120, 72, 36, 0.32);
  }
  .kiosk-card.blocked {
    opacity: 0.8;
    border-color: #fca5a5;
  }
  .kiosk-card.blocked:hover { transform: none; }

  .kiosk-card-imgwrap {
    height: 190px;
    flex-shrink: 0;
    overflow: hidden;
    background: #fff;
  }
  .kiosk-card-imgwrap img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center;
    display: block;
  }
  .kiosk-card-fallback {
    height: 190px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--brown-100);
    font-size: 32px;
  }

  .kiosk-card-info {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 2px;
    flex: 0;
    padding: 10px 12px 6px;
    text-align: center;
  }
  .kiosk-card-name {
    min-height: 45px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-weight: 700;
    font-size: 18px;
    line-height: 1.2;
    margin-bottom: 2px;
    color: var(--text-dark);
  }
  .kiosk-card-price {
    font-size: 20px;
    font-weight: 800;
    line-height: 1;
    margin: 0;
    color: var(--brown-700);
  }

  .kiosk-card-addbar {
    margin-top: auto;
    height: 48px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-weight: 800;
    font-size: 13px;
    letter-spacing: 0.4px;
    background: var(--brown-100);
    color: var(--brown-700);
    border-top: 1px solid var(--border);
    transition: background 0.15s ease, color 0.15s ease;
  }
  .kiosk-card.selected .kiosk-card-addbar {
    background: var(--brown-600);
    color: #fff;
  }
  .kiosk-card.blocked .kiosk-card-addbar {
    background: #fef2f2;
    color: #dc2626;
  }

  .kiosk-card-badge {
    position: absolute;
    top: 8px;
    right: 8px;
    border-radius: 8px;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 8px;
    line-height: 1.4;
    max-width: 85%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    box-shadow: 0 2px 6px rgba(0,0,0,0.12);
    z-index: 2;
  }

  /* ── Sidebar — fixed, non-scrolling except the order list ─────────── */
  .kiosk-sidebar {
    width: 380px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: #fff;
    border-left: 1px solid var(--border);
    overflow: hidden;
  }
  .kiosk-sidebar-header {
    flex-shrink: 0;
    padding: 20px 20px 16px;
    border-bottom: 1px solid var(--border);
  }
  .kiosk-sidebar-list {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 6px 16px;
  }
  .kiosk-sidebar-footer {
    flex-shrink: 0;
    padding: 16px 20px 20px;
    border-top: 1px solid var(--border);
    background: var(--cream);
  }

  .kiosk-cart-row {
    padding: 12px 0;
    border-bottom: 1px solid var(--border-light);
  }
  .kiosk-qtybtn {
    width: 26px; height: 26px; border: 1.5px solid var(--border);
    border-radius: var(--radius-sm); background: #fff;
    cursor: pointer; font-weight: 700; font-size: 14px;
    display: flex; align-items: center; justify-content: center;
    color: var(--brown-700); transition: background 0.12s ease;
  }
  .kiosk-qtybtn:hover { background: var(--brown-100); }

  .kiosk-summary-line {
    display: flex; justify-content: space-between;
    font-size: 13px; color: var(--text-mid); margin-bottom: 8px;
  }
  .kiosk-summary-total {
    display: flex; justify-content: space-between; align-items: baseline;
    margin-top: 10px; padding-top: 12px; border-top: 1.5px dashed var(--border);
  }
  .kiosk-payBtn {
    width: 100%;
    padding: 16px 0;
    min-height: 52px;
    border-radius: var(--radius-md);
    border: none;
    background: var(--brown-600);
    color: #fff;
    font-weight: 800;
    font-size: 15px;
    letter-spacing: 0.3px;
    cursor: pointer;
    transition: background 0.15s ease, transform 0.12s ease, opacity 0.15s ease;
  }
  .kiosk-payBtn:not(:disabled):hover { background: var(--brown-700); }
  .kiosk-payBtn:not(:disabled):active { transform: scale(0.98); }
  .kiosk-payBtn:disabled { opacity: 0.5; cursor: not-allowed; }

  /* ── Toast ─────────────────────────────────────────────────────────── */
  .kiosk-toast {
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--brown-800);
    color: #fff;
    padding: 12px 22px;
    border-radius: var(--radius-full);
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 8px 24px rgba(0,0,0,0.25);
    z-index: 3000;
    animation: kiosk-toast-up 0.22s ease-out;
  }
  @keyframes kiosk-toast-up {
    from { opacity: 0; transform: translateX(-50%) translateY(14px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }

  /* ── Tablet/mobile bottom bar + drawer (sidebar collapses below laptop) ── */
  .kiosk-mobilebar {
    display: none;
    position: fixed;
    left: 0; right: 0; bottom: 0;
    z-index: 1500;
    background: #fff;
    border-top: 1px solid var(--border);
    padding: 12px 16px;
    box-shadow: 0 -6px 20px rgba(0,0,0,0.08);
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  .kiosk-mobilebar-btn {
    background: var(--brown-600); color: #fff; border: none;
    border-radius: var(--radius-md); padding: 12px 20px;
    font-weight: 800; font-size: 14px; cursor: pointer;
    min-height: 48px;
  }
  .kiosk-drawer-overlay {
    position: fixed; inset: 0; z-index: 2500;
    background: rgba(0,0,0,0.45);
    display: none;
  }
  .kiosk-drawer-overlay.open { display: block; }
  .kiosk-drawer {
    position: absolute; left: 0; right: 0; bottom: 0;
    background: #fff;
    border-radius: 18px 18px 0 0;
    max-height: 82vh;
    display: flex; flex-direction: column;
    animation: kiosk-drawer-up 0.2s ease-out;
  }
  @keyframes kiosk-drawer-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0); }
  }
  .kiosk-drawer-handle {
    width: 44px; height: 5px; border-radius: 4px;
    background: var(--border); margin: 10px auto;
    flex-shrink: 0;
  }

  /* ── Responsive: sidebar width by breakpoint ─────────────────────── */
  @media (max-width: 1199px) {
    .kiosk-sidebar { width: 340px; } /* laptop */
  }
  @media (max-width: 991px) {
    .kiosk-sidebar { display: none; }   /* tablet: sidebar collapses */
    .kiosk-mobilebar { display: flex; } /* replaced by bottom bar + drawer */
    .kiosk-gridwrap { padding-bottom: 90px; }
  }
  @media (max-width: 767px) {
    .kiosk-catbar { padding: 0 12px; gap: 8px; height: 64px; }
    .kiosk-chip { height: 44px; padding: 0 16px; font-size: 13px; }
  }
`

const qtyBtnStyle = {
  width: 26, height: 26, border: '1.5px solid var(--border)',
  borderRadius: 'var(--radius-sm)', background: '#fff',
  cursor: 'pointer', fontWeight: 700, fontSize: 14,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: 'var(--brown-700)',
}

// ─────────────────────────────────────────────────────────────────────────────
// UNCHANGED — StockPopup component (logic untouched; only corner radius /
// shadow depth tuned to match the new kiosk look)
// ─────────────────────────────────────────────────────────────────────────────
function StockPopup({ popup, onClose }) {
  if (!popup) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 4000,
        background: 'rgba(0,0,0,0.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 20,
          padding: '26px 24px 20px', width: '100%', maxWidth: 400,
          boxShadow: '0 16px 48px rgba(0,0,0,0.24)',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>⛔</div>
          <h3 style={{
            fontFamily: 'var(--font-display)', color: '#991b1b',
            fontSize: 17, margin: 0,
          }}>
            {popup.title}
          </h3>
          {popup.message && (
            <p style={{ fontSize: 12, color: '#6b7280', margin: '6px 0 0', lineHeight: 1.5 }}>
              {popup.message}
            </p>
          )}
        </div>

        {popup.lines?.length > 0 && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fca5a5',
            borderRadius: 12, overflow: 'hidden', marginBottom: 18,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 80px',
              padding: '7px 12px',
              background: '#fee2e2', fontSize: 10, fontWeight: 700,
              color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.4,
            }}>
              <span>Ingredient</span>
              <span style={{ textAlign: 'center' }}>Needed</span>
              <span style={{ textAlign: 'center' }}>In Stock</span>
            </div>

            {popup.lines.map((line, i) => (
              <div
                key={line.label}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 80px 80px',
                  padding: '9px 12px', alignItems: 'center',
                  borderTop: i > 0 ? '1px solid #fecaca' : 'none',
                  background: '#fff',
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: '#1f2937' }}>
                    {line.label}
                  </div>
                  <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 1 }}>
                    unit: {line.unit}
                  </div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#dc2626' }}>
                    {line.needed}
                  </div>
                  {line.needsQty && (
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1, lineHeight: 1.3 }}>
                      {line.needsQty}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: '#6b7280' }}>
                    {line.available}
                  </div>
                  {line.stockQty && (
                    <div style={{ fontSize: 9, color: '#9ca3af', marginTop: 1, lineHeight: 1.3 }}>
                      {line.stockQty}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={onClose}
          style={{
            width: '100%', padding: '13px 0',
            borderRadius: 12, border: 'none',
            background: '#dc2626', color: '#fff',
            fontWeight: 700, fontSize: 14, cursor: 'pointer',
            minHeight: 48,
          }}
        >
          Got it
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Main POSPage component
// ─────────────────────────────────────────────────────────────────────────────
export default function POSPage() {
  const navigate = useNavigate()
  const { user } = useAuth()

  // UNCHANGED state
  const [menu,           setMenu]           = useState([])
  const [activeCategory, setActiveCategory] = useState(null)
  const [cart,           setCart]           = useState([])
  const [orderType,      setOrderType]      = useState('DINE_IN')
  const [loading,        setLoading]        = useState(false)
  const [error,          setError]          = useState('')
  const [confirmClear,   setConfirmClear]   = useState(false)

  // NOTE — the old cardSize ('sm' | 'md' | 'lg') + resize buttons have been
  // removed. The kiosk spec calls for every card to be an identical fixed
  // size (340px tall, 190px image) with "no exceptions," which is mutually
  // exclusive with a user-adjustable size control. Fixed sizes now live in
  // the .kiosk-card / .kiosk-card-imgwrap CSS classes above. Nothing about
  // cart, orders, or stock state was touched — this was a display-only knob.

  // UNCHANGED — stockInfo and fetchedIds
  const [stockInfo, setStockInfo] = useState({})
  const fetchedIds = useRef(new Set())

  // UNCHANGED — popup state
  const [popup, setPopup] = useState(null)

  // ADDED — UI-only state for the kiosk redesign. Neither touches cart data,
  // pricing, or API calls; they only control what's on screen.
  const [toast, setToast] = useState(null)                    // floating "added to cart" message
  const [mobileCartOpen, setMobileCartOpen] = useState(false) // tablet/mobile drawer visibility
  const toastTimer = useRef(null)

  const isOwner = user?.role === 'OWNER'
  const userBranchId = getUserBranchId(user)
  const [branches, setBranches] = useState([])
  const [selectedBranchId, setSelectedBranchId] = useState(isOwner ? null : userBranchId)

  // Fetch branches for Owner branch-switching
  useEffect(() => {
    if (isOwner) {
      branchesApi.list().then(res => {
        const list = (res.data || []).filter(b => b.isActive)
        setBranches(list)
        if (list.length && (!selectedBranchId || !list.find(b => b.id === Number(selectedBranchId)))) {
          setSelectedBranchId(list[0].id)
        }
      }).catch(() => {})
    } else {
      setSelectedBranchId(userBranchId)
    }
  }, [isOwner, userBranchId])

  const branchId = resolveBranchId({ isOwner, selectedBranchId, user })

  // ADDED — shows a floating toast for ~1.6s. Purely presentational.
  function showToast(message) {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1600)
  }
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current) }, [])

  // Branch-scoped menu loading with live stock evaluation
  const loadMenu = useCallback(() => {
    if (!branchId) return
    menuApi.categories({ branchId, includePhoto: true, enforceStock: false }).then(d => {
      setMenu(d.data || [])
      if (d.data?.length) setActiveCategory(prev => prev ?? d.data[0].id)
    })
  }, [branchId])

  useEffect(() => {
    fetchedIds.current.clear()
    setStockInfo({})
    setCart([])
    loadMenu()
  }, [branchId, loadMenu])

  // Stock fetching per category for current active branch
  useEffect(() => {
    if (!branchId || !activeCategory) return
    const cat = menu.find(c => c.id === activeCategory)
    if (!cat) return
    const unfetched = cat.items.filter(item => !fetchedIds.current.has(item.id))
    if (!unfetched.length) return
    unfetched.forEach(item => fetchedIds.current.add(item.id))
    Promise.allSettled(
      unfetched.map(item =>
        menuApi.checkStock(item.id, branchId).then(res => ({ id: item.id, ...res.data }))
      )
    ).then(results => {
      const updates = {}
      results.forEach(r => { if (r.status === 'fulfilled') updates[r.value.id] = r.value })
      setStockInfo(prev => ({ ...prev, ...updates }))
    })
  }, [activeCategory, menu, branchId])

  // UNCHANGED — derived values
  const currentItems = menu.find(c => c.id === activeCategory)?.items || []
  const totalAmount  = cart.reduce((sum, i) => sum + (parseInt(i.qty) || 0) * Number(i.price), 0)
  const cartCount    = cart.reduce((sum, i) => sum + (parseInt(i.qty) || 0), 0)

  // UNCHANGED — cart stock error computation
  const cartStockErrors = cart.flatMap(cartItem => {
    const info = stockInfo[cartItem.id]
    if (!info || !info.hasRecipe) return []
    const qty = parseInt(cartItem.qty) || 1
    return info.ingredients
      .filter(ing => ing.currentStock < ing.required * qty)
      .map(ing => ({
        itemName:       cartItem.name,
        ingredientName: ing.name,
        needed:         ing.required * qty,
        available:      ing.currentStock,
        unit:           ing.unit,
        needsQty: `${qty} order${qty !== 1 ? 's' : ''} × ${ing.required} per order`,
        stockQty: `${ing.currentStock} ${ing.unit} in stock`,
      }))
  })

  const hasBlockingError = cartStockErrors.length > 0

  // UNCHANGED — buildCartPopupLines
  function buildCartPopupLines() {
    const merged = {}
    for (const err of cartStockErrors) {
      if (!merged[err.ingredientName]) {
        merged[err.ingredientName] = { ...err }
      } else {
        merged[err.ingredientName].needed   += err.needed
        merged[err.ingredientName].needsQty  = `${merged[err.ingredientName].needed} total needed`
      }
    }
    return Object.values(merged).map(err => ({
      label:     err.ingredientName,
      needed:    `${err.needed} ${err.unit}`,
      available: `${err.available} ${err.unit}`,
      unit:      err.unit,
      needsQty:  err.needsQty,
      stockQty:  `currently in stock`,
    }))
  }

  // showBlockedCardPopup with branch stock inspection & limiting ingredient details
  function showBlockedCardPopup(item) {
    const info = stockInfo[item.id] || item
    let lines = []

    if (info?.hasRecipe === false || item.hasRecipe === false) {
      setPopup({
        title: `${item.name} — Recipe Not Configured`,
        message: 'This product cannot be ordered because its ingredient recipe has not been configured in the system. Please configure ingredients under Menu Management.',
        lines: [],
      })
      return
    }

    if (info?.ingredients?.length) {
      lines = info.ingredients
        .filter(ing => ing.status === 'OUT_OF_STOCK' || ing.possibleServings <= (info.availableServings ?? 0))
        .map(ing => ({
          label:     ing.name,
          needed:    `${ing.requiredPerServing || ing.required} ${ing.unit}`,
          available: `${ing.currentStock} ${ing.unit}`,
          unit:      ing.unit,
          needsQty:  `${ing.requiredPerServing || ing.required} ${ing.unit} needed per serving`,
          stockQty:  Number(ing.currentStock) === 0
            ? 'completely out of stock'
            : `only ${ing.currentStock} ${ing.unit} in stock (${ing.possibleServings} servings possible)`,
        }))
    } else if (item.outOfStockIngredients?.length) {
      lines = item.outOfStockIngredients.map(ing => ({
        label:     ing.name,
        needed:    `${ing.required} ${ing.unit}`,
        available: `${ing.available} ${ing.unit}`,
        unit:      ing.unit,
        needsQty:  `${ing.required} ${ing.unit} needed per serving`,
        stockQty:  Number(ing.available) === 0 ? 'completely out of stock' : `only ${ing.available} ${ing.unit} left`,
      }))
    }

    const limitingMsg = info.limitingIngredient?.name
      ? ` (Limited by ${info.limitingIngredient.name})`
      : ''

    setPopup({
      title:   `${item.name} — Insufficient Branch Stock${limitingMsg}`,
      message: lines.length > 0
        ? 'The following required recipe ingredients limit or prevent preparation in this branch:'
        : 'This item cannot be ordered because required recipe stock is depleted in this branch.',
      lines,
    })
  }

  // addToCart with recipe verification, limiting ingredient awareness, and available stock validation
  function addToCart(item) {
    const info = stockInfo[item.id] || item
    const hasRecipe = info.hasRecipe !== false && item.hasRecipe !== false

    if (!item.isGloballyAvailable || item.isBranchEnabled === false) {
      showBlockedCardPopup(item)
      return
    }

    if (!hasRecipe) {
      setPopup({
        title: `${item.name} — Recipe Not Configured`,
        message: 'This product cannot be sold because its ingredient recipe has not been configured in the system. Configure recipes under Menu Management.',
        lines: [],
      })
      return
    }

    const maxAvailable = info.availableServings ?? item.availableServings ?? 0
    if (maxAvailable <= 0) {
      showBlockedCardPopup(item)
      return
    }

    const existing = cart.find(i => i.id === item.id)
    const currentQty = existing ? (parseInt(existing.qty) || 0) : 0

    if (currentQty + 1 > maxAvailable) {
      const limitMsg = info.limitingIngredient
        ? ` Limited by ${info.limitingIngredient.name} (${info.limitingIngredient.currentStock} ${info.limitingIngredient.unit} in branch stock).`
        : ''
      setPopup({
        title: 'Maximum Available Stock Reached',
        message: `Cannot add more than ${maxAvailable} serving${maxAvailable !== 1 ? 's' : ''} of "${item.name}".${limitMsg}`,
        lines: (info.ingredients || [])
          .filter(i => i.possibleServings <= maxAvailable)
          .map(ing => ({
            label: ing.name,
            needed: `${roundDecimals((ing.requiredPerServing || ing.required) * (currentQty + 1), 3)} ${ing.unit}`,
            available: `${ing.currentStock} ${ing.unit}`,
            unit: ing.unit,
            needsQty: `Requires ${ing.requiredPerServing || ing.required} ${ing.unit} per serving`,
            stockQty: `${ing.currentStock} ${ing.unit} available in branch (${ing.possibleServings} servings max)`,
          })),
      })
      return
    }

    setCart(prev => {
      const ex = prev.find(i => i.id === item.id)
      if (ex) return prev.map(i => i.id === item.id ? { ...i, qty: i.qty + 1 } : i)
      return [...prev, { id: item.id, name: item.name, price: item.price, qty: 1 }]
    })
    setError('')
    showToast(`Added ${item.name} (${currentQty + 1}/${maxAvailable})`)
  }

  // adjustQty clamped to available servings
  function adjustQty(id, delta) {
    const item = menu.flatMap(c => c.items).find(i => i.id === id)
    const info = stockInfo[id] || item
    const maxAvailable = info?.availableServings ?? item?.availableServings ?? 999999

    setCart(prev =>
      prev.map(i => {
        if (i.id !== id) return i
        const current = parseInt(i.qty) || 0
        const next = current + delta
        if (delta > 0 && next > maxAvailable) {
          showToast(`Only ${maxAvailable} servings available for ${i.name}`)
          return { ...i, qty: maxAvailable }
        }
        return { ...i, qty: next }
      }).filter(i => i.qty > 0)
    )
  }

  // UNCHANGED — clearCart
  function clearCart() {
    setCart([]); setOrderType('DINE_IN'); setConfirmClear(false); setError('')
  }

  // UNCHANGED — placeOrder
  async function placeOrder() {
    if (!cart.length || !branchId) return

    if (hasBlockingError) {
      setPopup({
        title:   'Insufficient Stock',
        message: 'Some items in your cart cannot be prepared. Here are the details:',
        lines:   buildCartPopupLines(),
      })
      return
    }

    setLoading(true); setError('')
    try {
      const result = await ordersApi.create({
        type:  orderType,
        branchId,
        items: cart.map(i => ({ menuItemId: i.id, quantity: parseInt(i.qty) || 1 })),
      })
      const orderId = result?.data?.id

      fetchedIds.current.clear()
      setStockInfo({})
      loadMenu()
      clearCart()
      setMobileCartOpen(false) // ADDED — close drawer after a successful order

      if (orderId) {
        navigate('/orders', { state: { openOrderId: orderId, autoPay: true } })
      }
    } catch (e) {
      const isStockError = e.message?.toLowerCase().includes('stock') ||
                           e.message?.toLowerCase().includes('insufficient')

      if (isStockError) {
        fetchedIds.current.clear()
        setStockInfo({})
        loadMenu()
        setPopup({
          title:   'Order Failed — Stock Issue',
          message: e.message,
          lines:   [],
        })
      } else {
        setError(e.message)
      }
    } finally {
      setLoading(false)
    }
  }

  // getStockBadge with branch-specific available servings & limiting ingredient
  function getStockBadge(item) {
    const info = stockInfo[item.id] || item
    const hasRecipe = info.hasRecipe !== false && item.hasRecipe !== false

    if (!item.isGloballyAvailable) {
      return { label: '🚫 Disabled Globally', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' }
    }
    if (item.isBranchEnabled === false) {
      return { label: '🚫 Disabled in Branch', bg: '#f3f4f6', color: '#6b7280', border: '#d1d5db' }
    }
    if (!hasRecipe || info.availabilityStatus === 'RECIPE_NOT_CONFIGURED' || item.availabilityStatus === 'RECIPE_NOT_CONFIGURED') {
      return { label: '⚠️ Recipe Not Configured', bg: '#fef3c7', color: '#92400e', border: '#fde68a' }
    }
    if (info.availabilityStatus === 'INVALID_RECIPE_UNIT' || item.availabilityStatus === 'INVALID_RECIPE_UNIT') {
      return { label: '⚠️ Invalid Recipe Unit', bg: '#fef3c7', color: '#92400e', border: '#fde68a' }
    }

    const available = info.availableServings ?? item.availableServings ?? 0
    if (available <= 0 || !info.isStockAvailable || !item.isStockAvailable) {
      const limiting = info.limitingIngredient?.name ? ` (No ${info.limitingIngredient.name})` : ''
      return { label: `⛔ Out of Stock${limiting}`, bg: '#fee2e2', color: '#dc2626', border: '#fca5a5' }
    }
    if (available <= 10) {
      return { label: `⚠️ Low Stock: ${available} left`, bg: '#fffbeb', color: '#b45309', border: '#fcd34d' }
    }
    return { label: `✓ ${available} servings available`, bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' }
  }

  // ── ADDED — reusable order summary block, rendered in both the desktop/
  // laptop sidebar and the tablet/mobile drawer so the two stay in sync.
  // Pure presentation: reads the same cart/stockInfo/total already computed.
  function renderOrderSummary() {
    return (
      <>
        <div className="kiosk-sidebar-list">
          {cart.length === 0 ? (
            <EmptyState icon="🛒" title="Cart is empty" subtitle="Tap menu items to add" />
          ) : (
            cart.map(item => {
              const info = stockInfo[item.id]
              const qty  = parseInt(item.qty) || 1

              const stockWarnings = info?.hasRecipe
                ? info.ingredients.filter(ing => ing.currentStock < ing.required * qty)
                : []
              const lowWarnings = info?.hasRecipe
                ? info.ingredients.filter(ing => ing.status === 'LOW_STOCK' && ing.currentStock >= ing.required * qty)
                : []
              const isBlocked = stockWarnings.length > 0

              return (
                <div key={item.id} className="kiosk-cart-row">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: isBlocked ? '#dc2626' : 'var(--text-dark)' }}>
                        {isBlocked ? '⛔ ' : ''}{item.name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--brown-600)', marginTop: 2 }}>
                        ₱{Number(item.price).toFixed(0)} each · x{qty}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <button onClick={() => adjustQty(item.id, -1)} style={qtyBtnStyle} className="kiosk-qtybtn">−</button>
                      <input
                        type="number" min={1} value={item.qty}
                        onChange={e => {
                          const val = parseInt(e.target.value)
                          const max = info?.availableServings ?? item.availableServings ?? 999999
                          if (!isNaN(val) && val > 0) {
                            if (val > max) {
                              showToast(`Only ${max} servings available for ${item.name}`)
                              setCart(prev => prev.map(i => i.id === item.id ? { ...i, qty: max } : i))
                            } else {
                              setCart(prev => prev.map(i => i.id === item.id ? { ...i, qty: val } : i))
                            }
                          } else if (e.target.value === '') {
                            setCart(prev => prev.map(i => i.id === item.id ? { ...i, qty: '' } : i))
                          }
                        }}
                        onBlur={e => {
                          const val = parseInt(e.target.value)
                          const max = info?.availableServings ?? item.availableServings ?? 999999
                          if (isNaN(val) || val < 1) setCart(prev => prev.map(i => i.id === item.id ? { ...i, qty: 1 } : i))
                          else if (val > max) setCart(prev => prev.map(i => i.id === item.id ? { ...i, qty: max } : i))
                        }}
                        style={{
                          width: 40, textAlign: 'center', fontWeight: 700, fontSize: 13,
                          border: `1.5px solid ${isBlocked ? '#fca5a5' : 'var(--border)'}`,
                          borderRadius: 'var(--radius-sm)', padding: '2px 4px', outline: 'none',
                          color: isBlocked ? '#dc2626' : 'var(--text-dark)',
                        }}
                      />
                      <button onClick={() => adjustQty(item.id, +1)} style={qtyBtnStyle} className="kiosk-qtybtn">+</button>
                    </div>
                    <div style={{ minWidth: 52, textAlign: 'right', fontWeight: 800, color: isBlocked ? '#dc2626' : 'var(--brown-700)', fontSize: 13 }}>
                      ₱{(qty * Number(item.price)).toFixed(0)}
                    </div>
                  </div>

                  {stockWarnings.map(ing => (
                    <div key={ing.name} style={{
                      marginTop: 7, fontSize: 10, fontWeight: 600,
                      color: '#dc2626', background: '#fef2f2',
                      border: '1px solid #fca5a5', borderRadius: 7, padding: '5px 10px',
                      lineHeight: 1.5,
                    }}>
                      ⛔ <strong>{ing.name}</strong>
                      {' — '}
                      {qty} order{qty !== 1 ? 's' : ''} × {ing.required} per order
                      {' = '}
                      <strong>{ing.required * qty} {ing.unit}</strong> needed,
                      only <strong>{ing.currentStock} {ing.unit}</strong> in stock
                    </div>
                  ))}

                  {!isBlocked && lowWarnings.map(ing => (
                    <div key={ing.name} style={{
                      marginTop: 7, fontSize: 10, fontWeight: 600,
                      color: '#b45309', background: '#fffbeb',
                      border: '1px solid #fcd34d', borderRadius: 7, padding: '5px 10px',
                      lineHeight: 1.5,
                    }}>
                      ⚠️ <strong>{ing.name}</strong>
                      {' — '}
                      only <strong>{ing.currentStock} {ing.unit}</strong> remaining
                      {' '}(low stock — restock soon)
                    </div>
                  ))}
                </div>
              )
            })
          )}
        </div>

        <div className="kiosk-sidebar-footer">
          {error && (
            <div style={{ marginBottom: 10, fontSize: 11, fontWeight: 600, color: '#dc2626', background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '8px 12px', lineHeight: 1.5 }}>
              ⛔ {error}
            </div>
          )}

          {hasBlockingError && !error && (
            <button
              onClick={() => setPopup({
                title:   'Insufficient Stock',
                message: 'Some items in your cart cannot be prepared. Tap each red item for details.',
                lines:   buildCartPopupLines(),
              })}
              style={{
                width: '100%', marginBottom: 10,
                fontSize: 11, fontWeight: 700,
                color: '#dc2626', background: '#fef2f2',
                border: '1.5px solid #fca5a5', borderRadius: 8,
                padding: '9px 12px', lineHeight: 1.5, cursor: 'pointer',
                textAlign: 'left', minHeight: 40,
              }}
            >
              ⛔ Stock issue detected — tap here to see details
            </button>
          )}

          <div className="kiosk-summary-line">
            <span>Subtotal</span>
            <span>₱{totalAmount.toFixed(2)}</span>
          </div>
          <div className="kiosk-summary-line">
            <span>Service Fee</span>
            <span>₱0.00</span>
          </div>
          <div className="kiosk-summary-total">
            <span style={{ fontWeight: 700, color: 'var(--text-mid)', fontSize: 13 }}>TOTAL</span>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--brown-800)', fontWeight: 800 }}>
              ₱{totalAmount.toFixed(2)}
            </span>
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
            {cart.length > 0 && (
              <Button variant="ghost" onClick={() => setConfirmClear(true)} style={{ flex: '0 0 auto' }}>Clear</Button>
            )}
            <button
              className="kiosk-payBtn"
              disabled={loading || cart.length === 0 || hasBlockingError}
              onClick={placeOrder}
            >
              {loading ? 'Creating…' : '💳 ORDER & PAY'}
            </button>
          </div>
        </div>
      </>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="kiosk-shell">
      <style>{kioskStyles}</style>

      {/* UNCHANGED — StockPopup rendered at root level so it overlays everything */}
      <StockPopup popup={popup} onClose={() => setPopup(null)} />

      {/* ADDED — floating "added to cart" toast */}
      {toast && <div className="kiosk-toast">✓ {toast}</div>}

      {/* ── Main column: category bar (sticky) + product grid (scrolls) ─── */}
      <div className="kiosk-main">

        <div className="kiosk-catbar">
          {/* Branch indicator / switcher */}
          {isOwner && branches.length > 0 ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginRight: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--brown-800)' }}>📍 Branch:</span>
              <select
                value={selectedBranchId}
                onChange={e => setSelectedBranchId(Number(e.target.value))}
                style={{
                  height: 44,
                  padding: '0 14px',
                  borderRadius: 'var(--radius-full)',
                  border: '2px solid var(--brown-600)',
                  background: '#fff',
                  fontWeight: 700,
                  fontSize: 13,
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
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              marginRight: 8,
              padding: '0 16px',
              height: 44,
              borderRadius: 'var(--radius-full)',
              background: 'var(--brown-50)',
              border: '1.5px solid var(--brown-200)',
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--brown-700)',
              flexShrink: 0,
            }}>
              📍 {user.branch.name}
            </div>
          ) : null}

          {menu.map(cat => (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`kiosk-chip ${activeCategory === cat.id ? 'active' : 'inactive'}`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="kiosk-gridwrap">
          <div className="kiosk-grid">
            {currentItems.length === 0 && (
              <div style={{ gridColumn: '1/-1' }}>
                <EmptyState icon="🍽️" title="No items in this category" />
              </div>
            )}

            {currentItems.map(item => {
              const inCart  = cart.find(i => i.id === item.id)
              const badge   = getStockBadge(item)
              const blocked = badge?.label?.startsWith('⛔')

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    if (blocked) {
                      showBlockedCardPopup(item)
                    } else {
                      addToCart(item)
                    }
                  }}
                  className={`kiosk-card ${blocked ? 'blocked' : inCart ? 'selected' : ''}`}
                >
                  {badge && (
                    <div className="kiosk-card-badge" style={{ background: badge.bg, color: badge.color, border: `1px solid ${badge.border}` }}>
                      {badge.label}
                    </div>
                  )}

                  {item.photo ? (
                    <div className="kiosk-card-imgwrap">
                      <img src={item.photo} alt={item.name} />
                    </div>
                  ) : (
                    <div className="kiosk-card-fallback">☕</div>
                  )}

                  <div className="kiosk-card-info">
                    <div className="kiosk-card-name">{item.name}</div>
                    <div className="kiosk-card-price">₱{Number(item.price).toFixed(0)}</div>
                    {item.hasRecipe && item.availableServings != null && (
                      <div style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: item.availableServings <= 0 ? '#dc2626' : item.availableServings <= 10 ? '#b45309' : '#15803d',
                        marginTop: 2,
                      }}>
                        {item.availableServings > 0
                          ? `${item.availableServings} servings available`
                          : '0 servings left'}
                      </div>
                    )}
                  </div>

                  <div className="kiosk-card-addbar">
                    {blocked
                      ? 'UNAVAILABLE'
                      : inCart
                        ? `✓ ×${inCart.qty} in cart`
                        : 'ADD'}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* ── Sidebar (desktop / laptop) — fixed, only the order list scrolls ── */}
      <aside className="kiosk-sidebar">
        <div className="kiosk-sidebar-header">
          <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 18, marginBottom: 12 }}>Orders</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {['DINE_IN', 'TAKEOUT'].map(t => (
              <button key={t} onClick={() => setOrderType(t)} style={{
                flex: 1, padding: '10px 4px', minHeight: 40,
                border:     `2px solid ${orderType === t ? 'var(--brown-600)' : 'var(--border)'}`,
                borderRadius: 'var(--radius-md)',
                background: orderType === t ? 'var(--brown-600)' : '#fff',
                color:      orderType === t ? '#fff' : 'var(--brown-700)',
                fontWeight: 700, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
              }}>
                {t === 'DINE_IN' ? 'Dine In' : 'Takeout'}
              </button>
            ))}
          </div>
        </div>

        {renderOrderSummary()}
      </aside>

      {/* ── Tablet/mobile bottom bar (sidebar collapses below 992px) ────── */}
      <div className="kiosk-mobilebar">
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-mid)', textTransform: 'uppercase' }}>
            {cartCount} item{cartCount !== 1 ? 's' : ''}
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 800, color: 'var(--brown-800)' }}>
            ₱{totalAmount.toFixed(2)}
          </div>
        </div>
        <button
          className="kiosk-mobilebar-btn"
          disabled={cart.length === 0}
          style={{ opacity: cart.length === 0 ? 0.5 : 1 }}
          onClick={() => setMobileCartOpen(true)}
        >
          View Cart
        </button>
      </div>

      {/* ── Tablet/mobile cart drawer ─────────────────────────────────────── */}
      <div className={`kiosk-drawer-overlay ${mobileCartOpen ? 'open' : ''}`} onClick={() => setMobileCartOpen(false)}>
        <div className="kiosk-drawer" onClick={e => e.stopPropagation()}>
          <div className="kiosk-drawer-handle" />
          <div className="kiosk-sidebar-header" style={{ paddingTop: 4 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 18, marginBottom: 12 }}>Your Order</h2>
            <div style={{ display: 'flex', gap: 6 }}>
              {['DINE_IN', 'TAKEOUT'].map(t => (
                <button key={t} onClick={() => setOrderType(t)} style={{
                  flex: 1, padding: '10px 4px', minHeight: 40,
                  border:     `2px solid ${orderType === t ? 'var(--brown-600)' : 'var(--border)'}`,
                  borderRadius: 'var(--radius-md)',
                  background: orderType === t ? 'var(--brown-600)' : '#fff',
                  color:      orderType === t ? '#fff' : 'var(--brown-700)',
                  fontWeight: 700, fontSize: 11, cursor: 'pointer', transition: 'all 0.15s',
                }}>
                  {t === 'DINE_IN' ? 'Dine In' : 'Takeout'}
                </button>
              ))}
            </div>
          </div>
          {renderOrderSummary()}
        </div>
      </div>

      {/* UNCHANGED — Clear confirmation modal */}
      {confirmClear && (
        <div onClick={() => setConfirmClear(false)} style={{ position: 'fixed', inset: 0, zIndex: 3500, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 'var(--radius-lg)', padding: '28px 28px 22px', width: 300, boxShadow: '0 8px 32px rgba(0,0,0,0.18)', textAlign: 'center' }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🗑️</div>
            <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 18, marginBottom: 8 }}>Clear cart?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-mid)', marginBottom: 22 }}>This will remove all items from the current order.</p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmClear(false)} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: '1.5px solid var(--border)', background: '#fff', color: 'var(--brown-700)', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>No, keep</button>
              <button onClick={clearCart} style={{ flex: 1, padding: '10px 0', borderRadius: 'var(--radius-md)', border: 'none', background: 'var(--brown-600)', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', minHeight: 44 }}>Yes, clear</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}