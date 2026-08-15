import { useState, useEffect, useCallback, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ordersApi, authApi } from '../api/client'
import { Badge, Button, Modal, EmptyState } from '../components/ui'
import { printReceipt } from '../components/ui/ThermalReceipt'
import { useAuth } from '../context/AuthContext'

const STATUSES  = ['COMPLETED', 'CANCELLED']
const PAGE_SIZE = 20

const PH_DISCOUNTS = {
  SENIOR:  { label: 'Senior Citizen', percentage: 20, icon: '🧓' },
  PWD:     { label: 'PWD',            percentage: 20, icon: '♿' },
  STUDENT: { label: 'Student',        percentage: 10, icon: '🎓' },
}

const labelStyle = {
  fontSize: 12, fontWeight: 700, color: 'var(--text-muted)',
  letterSpacing: 0.5, textTransform: 'uppercase', display: 'block', marginBottom: 7,
}
const inputStyle = {
  width: '100%', padding: '9px 12px',
  border: '1.5px solid var(--border)', borderRadius: 'var(--radius-md)',
  fontSize: 13.5, background: '#fff', outline: 'none',
}

const MODAL_WIDTH = 460
const narrowStyle = { maxWidth: 320, margin: '0 auto' }

// ── 3-Dot Menu ────────────────────────────────────────
// Change 1: no reopen for COMPLETED
// Change 2: View Order moved into menu
function OrderRowMenu({ order, onView, onPay, onReprint, onCancel, onReopen }) {
  const [open, setOpen] = useState(false)
  const ref = useRef()

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const isCancellable = order.status !== 'CANCELLED' && order.status !== 'COMPLETED'
  const canPay        = !order.payment && order.status !== 'CANCELLED' && order.status !== 'COMPLETED'
  const canReprint    = order.status === 'COMPLETED' && order.payment
  // Change 1: reopen only for CANCELLED, not COMPLETED
  const isReopenable  = order.status === 'CANCELLED'

  const menuItems = [
    { label: '👁 View Order', action: onView },  // Change 2: always first
    canPay        && { label: '💳 Pay Now',         action: onPay },
    canReprint    && { label: '🖨️ Reprint Receipt',  action: onReprint },
    isCancellable && { label: '❌ Cancel Order',    action: onCancel },
    isReopenable  && { label: '🔓 Reopen Order',    action: onReopen },
  ].filter(Boolean)

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={e => { e.stopPropagation(); setOpen(o => !o) }}
        style={{
          width: 32, height: 32, border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-sm)', background: '#fff',
          cursor: 'pointer', fontSize: 16, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)',
        }}
      >⋮</button>

      {open && (
        <div style={{
          position: 'absolute', top: 36, left: 0, zIndex: 200,
          background: '#fff', border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)', boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
          minWidth: 180, overflow: 'hidden',
        }}>
          {menuItems.map((item, i) => (
            <button key={i}
              onClick={e => { e.stopPropagation(); setOpen(false); item.action() }}
              style={{
                width: '100%', padding: '10px 14px', border: 'none',
                background: 'none', textAlign: 'left', cursor: 'pointer',
                fontSize: 13, fontWeight: 600, color: 'var(--text-dark)',
                borderBottom: i < menuItems.length - 1 ? '1px solid var(--border-light)' : 'none',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brown-100)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >{item.label}</button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Discount View ──────────────────────────────────────
function DiscountView({ total, selected, setSelected, onApply, onBack }) {
  const discount = PH_DISCOUNTS[selected]
  const deducted = (discount.percentage / 100) * total
  const newTotal = Math.max(0, total - deducted)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <label style={labelStyle}>Discount Type</label>
        <select value={selected} onChange={e => setSelected(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
          {Object.entries(PH_DISCOUNTS).map(([key, d]) => (
            <option key={key} value={key}>{d.icon} {d.label} — {d.percentage}%</option>
          ))}
        </select>
      </div>
      <div style={{ background: 'var(--brown-100)', borderRadius: 'var(--radius-md)', padding: '16px 18px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--text-mid)', marginBottom: 8 }}>
          <span>Original Total</span><span>₱{total.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, color: 'var(--red-dark)', marginBottom: 8 }}>
          <span>{discount.label} Discount ({discount.percentage}%)</span>
          <span>- ₱{deducted.toFixed(2)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 17, fontWeight: 700, color: 'var(--brown-800)', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <span>New Total</span><span>₱{newTotal.toFixed(2)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="outline" fullWidth onClick={onBack}>Cancel</Button>
        <Button variant="primary" fullWidth onClick={() => onApply({ key: selected, label: discount.label, percentage: discount.percentage, deducted })}>Apply</Button>
      </div>
    </div>
  )
}

// ── Cancel View ────────────────────────────────────────
function CancelView({ order, onClose, onCancelled }) {
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState('')

  async function handleCancel() {
    setLoading(true); setError('')
    try { await ordersApi.cancel(order.id); onCancelled() }
    catch (e) { setError(e.message) }
    finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ ...narrowStyle, textAlign: 'center', padding: '10px 0 24px' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>⚠️</div>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 19, marginBottom: 10 }}>
          Cancel {order.orderNumber}?
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-mid)', marginBottom: 0 }}>
          This will cancel the order. This action cannot be undone.
        </p>
      </div>
      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 14, textAlign: 'center' }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="outline" fullWidth onClick={onClose}>No, Keep</Button>
        <Button variant="danger" fullWidth disabled={loading} onClick={handleCancel}>
          {loading ? 'Cancelling…' : 'Yes, Cancel'}
        </Button>
      </div>
    </div>
  )
}

// ── Reopen View ────────────────────────────────────────
function ReopenView({ order, onClose, onReopened }) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleReopen() {
    if (!password.trim()) { setError('Password is required.'); return }
    setLoading(true); setError('')
    try {
      await authApi.login(user.email, password)
      let reopened = { ...order, status: 'PENDING', payment: null }
      if (typeof ordersApi.reopen === 'function') {
        const result = await ordersApi.reopen(order.id)
        reopened = result?.data || reopened
      }
      onReopened(reopened)
    } catch (e) {
      setError(e.message || 'Incorrect password. Please try again.')
    } finally { setLoading(false) }
  }

  return (
    <div>
      <div style={{ ...narrowStyle, textAlign: 'center', padding: '10px 0 24px' }}>
        <div style={{ fontSize: 44, marginBottom: 14 }}>🔓</div>
        <h3 style={{ fontFamily: 'var(--font-display)', color: 'var(--brown-800)', fontSize: 19, marginBottom: 10 }}>
          Reopen {order.orderNumber}?
        </h3>
        <p style={{ fontSize: 13.5, color: 'var(--text-mid)' }}>
          Enter your password to reopen this order.
        </p>
      </div>
      <div style={{ ...narrowStyle, marginBottom: 18, textAlign: 'left' }}>
        <label style={labelStyle}>Your Password</label>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleReopen()}
          placeholder="Enter your password" style={inputStyle} autoFocus />
      </div>
      {error && <p style={{ ...narrowStyle, color: 'var(--red)', fontSize: 13, marginBottom: 14 }}>{error}</p>}
      <div style={{ display: 'flex', gap: 12 }}>
        <Button variant="outline" fullWidth onClick={onClose}>Cancel</Button>
        <Button variant="primary" fullWidth disabled={loading || !password.trim()} onClick={handleReopen}>
          {loading ? 'Verifying…' : 'Confirm Reopen'}
        </Button>
      </div>
    </div>
  )
}

// ── Payment View ───────────────────────────────────────
function PaymentView({ order, baseTotal, total, method, setMethod, amountPaid, setAmountPaid, refNo, setRefNo, discount, onRemoveDiscount, onOpenDiscount, loading, error, onBack, onPay }) {
  const paid            = Number(amountPaid) || 0
  const change          = paid - total
  const needsRef        = method !== 'CASH'
  const nonCashOverpaid = method !== 'CASH' && paid > total
  const canConfirm      = paid >= total && (!needsRef || refNo.trim().length > 0) && !nonCashOverpaid

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ background: 'var(--brown-100)', borderRadius: 'var(--radius-md)', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ color: 'var(--brown-800)', fontSize: 13.5 }}>{order.orderNumber}</span>
        <div style={{ textAlign: 'right' }}>
          {discount && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textDecoration: 'line-through' }}>
              P{baseTotal.toFixed(2)}
            </div>
          )}
          <span style={{ color: 'var(--brown-800)', fontWeight: 700, fontSize: 22, fontFamily: 'var(--font-display)' }}>
            P{total.toFixed(2)}
          </span>
        </div>
      </div>

      {discount ? (
        <div style={{ background: 'var(--red-light)', borderRadius: 'var(--radius-md)', padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--red-dark)' }}>
              {PH_DISCOUNTS[discount.key]?.icon} {discount.label} ({discount.percentage}%)
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--red-dark)' }}>- ₱{discount.deducted.toFixed(2)} → New total: ₱{total.toFixed(2)}</div>
          </div>
          <button onClick={onRemoveDiscount} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red-dark)', fontWeight: 700, fontSize: 18, padding: '0 4px' }}>✕</button>
        </div>
      ) : (
        <button onClick={onOpenDiscount} style={{
          width: '100%', padding: '10px 14px',
          border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-md)',
          background: '#fff', color: 'var(--brown-600)',
          fontWeight: 700, fontSize: 13.5, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>🏷️ Add Discount</button>
      )}

      <div>
        <label style={labelStyle}>Payment Method</label>
        <div style={{ display: 'flex', gap: 10 }}>
          {['CASH', 'GCASH', 'MAYA', 'CARD'].map(m => (
            <button key={m} onClick={() => { setMethod(m); setRefNo(''); setAmountPaid('') }} style={{
              flex: 1, padding: '10px 4px',
              border: `2px solid ${method === m ? 'var(--brown-600)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: method === m ? 'var(--brown-600)' : '#fff',
              color: method === m ? '#fff' : 'var(--brown-700)',
              fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 180ms ease',
            }}>{m}</button>
          ))}
        </div>
      </div>

      <div>
        <label style={labelStyle}>Amount Paid (P)</label>
        <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
          placeholder={`Minimum P${total.toFixed(2)}${method !== 'CASH' ? ` (max P${total.toFixed(2)})` : ''}`}
          style={{ ...inputStyle, borderColor: nonCashOverpaid ? 'var(--red)' : undefined }} />
        {nonCashOverpaid && (
          <p style={{ color: 'var(--red)', fontSize: 12, marginTop: 4 }}>
            {method} payments cannot exceed the payable amount of ₱{total.toFixed(2)}.
          </p>
        )}
      </div>

      {needsRef && (
        <div>
          <label style={labelStyle}>{method} Reference No. *</label>
          <input value={refNo} onChange={e => setRefNo(e.target.value)}
            placeholder={`Enter ${method} reference number`} style={inputStyle} />
        </div>
      )}

      {paid > 0 && !nonCashOverpaid && (
        <div style={{ background: change >= 0 ? 'var(--green-light)' : 'var(--red-light)', borderRadius: 'var(--radius-md)', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: change >= 0 ? 'var(--green-dark)' : 'var(--red-dark)', fontSize: 13.5, fontWeight: 600 }}>
            {change >= 0 ? 'Change' : 'Short by'}
          </span>
          <span style={{ color: change >= 0 ? 'var(--green-dark)' : 'var(--red-dark)', fontWeight: 700, fontSize: 19 }}>
            P{Math.abs(change).toFixed(2)}
          </span>
        </div>
      )}

      {needsRef && !refNo.trim() && paid >= total && !nonCashOverpaid && (
        <p style={{ color: 'var(--brown-600)', fontSize: 12, margin: 0 }}>Reference number is required for {method} payments.</p>
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 13, margin: 0 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 12, paddingTop: 6 }}>
        <Button variant="outline" onClick={onBack} style={{ flex: '0 0 auto' }}>Cancel</Button>
        <Button variant="success" size="lg" fullWidth disabled={loading || !canConfirm} onClick={onPay}>
          {loading ? 'Processing...' : 'Confirm and Print Receipt'}
        </Button>
      </div>
    </div>
  )
}

// ── View-Only Detail ───────────────────────────────────
function ViewOnlyDetail({ order }) {
  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 16, marginTop: -8 }}>
        <Badge status={order.status} />
        <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>{order.type?.replace('_', ' ')}</span>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 12 }}>
        {order.items?.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '11px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-dark)' }}>{item.menuItem?.name}</div>
              {item.notes && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 2 }}>{item.notes}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>x{item.quantity}</div>
              <div style={{ fontWeight: 700, color: 'var(--brown-700)', fontSize: 14.5 }}>P{Number(item.subtotal).toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 18px' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-mid)' }}>TOTAL</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--brown-800)', fontWeight: 700 }}>
          P{Number(order.totalAmount).toFixed(2)}
        </span>
      </div>
      {order.payment && (
        <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 16 }}>
          <div style={{ color: 'var(--green-dark)', fontWeight: 700, marginBottom: 5, fontSize: 13.5 }}>Paid via {order.payment.method}</div>
          <div style={{ color: 'var(--green-dark)', fontSize: 13.5 }}>
            Paid: P{Number(order.payment.amountPaid).toFixed(2)} | Change: P{Number(order.payment.change).toFixed(2)}
          </div>
          {order.payment.referenceNo && (
            <div style={{ color: 'var(--green-dark)', fontSize: 12.5, marginTop: 3 }}>Ref: {order.payment.referenceNo}</div>
          )}
        </div>
      )}
      <div style={{ marginTop: 8, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'right' }}>
        {order.cashier?.name} | {new Date(order.createdAt).toLocaleString('en-PH')}
      </div>
    </div>
  )
}

// ── Detail View (with actions) ─────────────────────────
function DetailView({ order, onPayNow, onCancelOrder, onReopenOrder, onReprint }) {
  const isCancellable = order.status !== 'CANCELLED' && order.status !== 'COMPLETED'
  // Change 1: reopen only for CANCELLED
  const isReopenable  = order.status === 'CANCELLED'

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, marginTop: -6 }}>
        <Badge status={order.status} />
        <span style={{ fontSize: 13.5, color: 'var(--text-muted)' }}>{order.type?.replace('_', ' ')}</span>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }}>
        {order.items?.map(item => (
          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '12px 0', borderBottom: '1px solid var(--border-light)' }}>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text-dark)' }}>{item.menuItem?.name}</div>
              {item.notes && <div style={{ fontSize: 11.5, color: 'var(--text-faint)', marginTop: 3 }}>{item.notes}</div>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 14 }}>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>x{item.quantity}</div>
              <div style={{ fontWeight: 700, color: 'var(--brown-700)', fontSize: 14.5 }}>P{Number(item.subtotal).toFixed(2)}</div>
            </div>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '10px 0 18px' }}>
        <span style={{ fontWeight: 700, color: 'var(--text-mid)' }}>TOTAL</span>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--brown-800)', fontWeight: 700 }}>
          P{Number(order.totalAmount).toFixed(2)}
        </span>
      </div>
      {order.payment && (
        <div style={{ background: 'var(--green-light)', borderRadius: 'var(--radius-md)', padding: '14px 16px', marginBottom: 18 }}>
          <div style={{ color: 'var(--green-dark)', fontWeight: 700, marginBottom: 5, fontSize: 13.5 }}>Paid via {order.payment.method}</div>
          <div style={{ color: 'var(--green-dark)', fontSize: 13.5 }}>
            Paid: P{Number(order.payment.amountPaid).toFixed(2)} | Change: P{Number(order.payment.change).toFixed(2)}
          </div>
          {order.payment.referenceNo && (
            <div style={{ color: 'var(--green-dark)', fontSize: 12.5, marginTop: 3 }}>Ref: {order.payment.referenceNo}</div>
          )}
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        {!order.payment && order.status !== 'CANCELLED' && order.status !== 'COMPLETED' && (
          <Button variant="success" fullWidth onClick={onPayNow}>Pay Now</Button>
        )}
        {order.status === 'COMPLETED' && order.payment && (
          <Button variant="outline" fullWidth onClick={onReprint}>Reprint Receipt</Button>
        )}
        {isCancellable && <Button variant="danger" fullWidth onClick={onCancelOrder}>Cancel Order</Button>}
        {isReopenable  && <Button variant="outline" fullWidth onClick={onReopenOrder}>🔓 Reopen Order</Button>}
      </div>
      <div style={{ marginTop: 18, fontSize: 11.5, color: 'var(--text-faint)', textAlign: 'right' }}>
        {order.cashier?.name} | {new Date(order.createdAt).toLocaleString('en-PH')}
      </div>
    </div>
  )
}

// ── Order Detail Modal ─────────────────────────────────
function OrderDetailModal({ orderId, onClose, onRefresh, autoOpenPay = false, initialView = 'detail', viewOnly = false }) {
  const { user } = useAuth()
  const [order, setOrder] = useState(null)
  const [view,  setView]  = useState(viewOnly ? 'viewonly' : initialView)

  const [method,           setMethod]           = useState('CASH')
  const [amountPaid,       setAmountPaid]       = useState('')
  const [refNo,            setRefNo]            = useState('')
  const [discount,         setDiscount]         = useState(null)
  const [discountSelected, setDiscountSelected] = useState('SENIOR')
  const [payLoading,       setPayLoading]       = useState(false)
  const [payError,         setPayError]         = useState('')

  useEffect(() => {
    ordersApi.get(orderId).then(d => setOrder(d.data))
  }, [orderId])

  useEffect(() => {
    if (!autoOpenPay || !order) return
    if (!order.payment && order.status !== 'CANCELLED' && order.status !== 'COMPLETED') setView('pay')
  }, [autoOpenPay, order])

  function resetPaymentForm() {
    setMethod('CASH'); setAmountPaid(''); setRefNo(''); setDiscount(null); setPayError('')
  }

  function handleReprint() {
    if (!order?.payment) return
    const d = order.payment.discountAmount
      ? { label: order.payment.discountLabel, percentage: Number(order.payment.discountPercentage), deducted: Number(order.payment.discountAmount) }
      : null
    printReceipt({ ...order, cashier: order.cashier, branch: user?.branch }, order.payment, user?.branch?.name, d)
  }

  async function handlePay() {
    const baseTotal = Number(order.totalAmount)
    const total = discount ? Math.max(0, baseTotal - discount.deducted) : baseTotal
    setPayLoading(true); setPayError('')
    try {
      const payload = { method, amountPaid: Number(amountPaid) || 0 }
      if (method !== 'CASH' && refNo.trim()) payload.referenceNo = refNo.trim()
      if (discount) { payload.discountType = discount.key; payload.discountAmount = discount.deducted }
      const result = await ordersApi.pay(order.id, payload)
      printReceipt(
        { ...order, cashier: { name: user?.name }, branch: user?.branch },
        result.data.payment,
        user?.branch?.name,
        discount
      )
      resetPaymentForm(); onRefresh(); onClose()
    } catch (e) {
      setPayError(e.message)
    } finally {
      setPayLoading(false)
    }
  }

  if (!order) {
    return (
      <Modal title="Order Details" onClose={onClose} width={MODAL_WIDTH}>
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text-faint)' }}>Loading...</div>
      </Modal>
    )
  }

  const baseTotal  = Number(order.totalAmount)
  const total      = discount ? Math.max(0, baseTotal - discount.deducted) : baseTotal
  const modalClose = view === 'pay' ? null : onClose

  const titles = {
    viewonly: `Order ${order.orderNumber} — View Only`,
    detail:   `Order ${order.orderNumber}`,
    pay:      'Process Payment',
    discount: 'Apply Discount',
    cancel:   'Cancel Order',
    reopen:   'Reopen Order',
  }

  return (
    <Modal title={titles[view]} onClose={modalClose} width={MODAL_WIDTH}>
      {view === 'viewonly' && <ViewOnlyDetail order={order} />}
      {view === 'detail' && (
        <DetailView
          order={order}
          onPayNow={() => { resetPaymentForm(); setView('pay') }}
          onCancelOrder={() => setView('cancel')}
          onReopenOrder={() => setView('reopen')}
          onReprint={handleReprint}
        />
      )}
      {view === 'pay' && (
        <PaymentView
          order={order} baseTotal={baseTotal} total={total}
          method={method} setMethod={setMethod}
          amountPaid={amountPaid} setAmountPaid={setAmountPaid}
          refNo={refNo} setRefNo={setRefNo}
          discount={discount}
          onRemoveDiscount={() => { setDiscount(null); setAmountPaid('') }}
          onOpenDiscount={() => setView('discount')}
          loading={payLoading} error={payError}
          onBack={() => setView('detail')}
          onPay={handlePay}
        />
      )}
      {view === 'discount' && (
        <DiscountView
          total={baseTotal}
          selected={discountSelected} setSelected={setDiscountSelected}
          onBack={() => setView('pay')}
          onApply={d => { setDiscount(d); setAmountPaid(''); setView('pay') }}
        />
      )}
      {view === 'cancel' && (
        <CancelView
          order={order}
          onClose={() => setView('detail')}
          onCancelled={() => { onRefresh(); onClose() }}
        />
      )}
      {view === 'reopen' && (
        <ReopenView
          order={order}
          onClose={() => setView('detail')}
          onReopened={updated => { setOrder(updated); resetPaymentForm(); setView('pay') }}
        />
      )}
    </Modal>
  )
}

// ── Pagination ─────────────────────────────────────────
function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null
  const pages = []
  for (let i = 1; i <= totalPages; i++) pages.push(i)

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, padding: '18px 0 4px' }}>
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
        style={{ padding: '7px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', cursor: page === 1 ? 'not-allowed' : 'pointer', color: page === 1 ? 'var(--text-faint)' : 'var(--brown-700)', fontWeight: 700, fontSize: 13 }}>
        ← Prev
      </button>
      {pages.map(p => (
        <button key={p} onClick={() => onChange(p)} style={{
          width: 36, height: 36,
          border: `1.5px solid ${p === page ? 'var(--brown-600)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-sm)',
          background: p === page ? 'var(--brown-600)' : '#fff',
          color: p === page ? '#fff' : 'var(--brown-700)',
          fontWeight: 700, fontSize: 13, cursor: 'pointer',
        }}>{p}</button>
      ))}
      <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
        style={{ padding: '7px 14px', border: '1.5px solid var(--border)', borderRadius: 'var(--radius-sm)', background: '#fff', cursor: page === totalPages ? 'not-allowed' : 'pointer', color: page === totalPages ? 'var(--text-faint)' : 'var(--brown-700)', fontWeight: 700, fontSize: 13 }}>
        Next →
      </button>
    </div>
  )
}

// ── Order Row ──────────────────────────────────────────
// Change 2: eye button removed — view is now in the menu
function OrderRow({ order, onAction }) {
  const displayName = order.customerName
    ? `${order.customerName} - ${order.orderNumber}`
    : order.orderNumber

  const dateStr = new Date(order.createdAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })
  const timeStr = new Date(order.createdAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '12px 18px', borderBottom: '1px solid var(--border-light)',
      background: '#fff', transition: 'background 0.1s',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--cream)'}
      onMouseLeave={e => e.currentTarget.style.background = '#fff'}
    >
      <OrderRowMenu
        order={order}
        onView={()    => onAction(order.id, 'viewonly')}
        onPay={()     => onAction(order.id, 'pay')}
        onReprint={()  => onAction(order.id, 'reprint')}
        onCancel={()   => onAction(order.id, 'cancel')}
        onReopen={()   => onAction(order.id, 'reopen')}
      />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {displayName}
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
          {order.items?.slice(0, 2).map(i => i.menuItem?.name).join(', ')}
          {order.items?.length > 2 ? ` +${order.items.length - 2} more` : ''}
        </div>
      </div>

      <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, color: 'var(--brown-700)', fontSize: 14.5, flexShrink: 0 }}>
        ₱{Number(order.totalAmount).toFixed(2)}
      </div>

      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'right', flexShrink: 0, minWidth: 150 }}>
        <div>{dateStr}</div>
        <div>{timeStr}</div>
      </div>

      <div style={{ flexShrink: 0 }}>
        <Badge status={order.status} />
      </div>
    </div>
  )
}

// ── Main Page ──────────────────────────────────────────
// Change 3: layout/spacing matches Dashboard (95% width, maxWidth 1800, padding 28)
export default function OrdersPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user } = useAuth()

  const [orders,         setOrders]         = useState([])
  const [filter,         setFilter]         = useState('COMPLETED')
  const [loading,        setLoading]        = useState(false)
  const [selectedId,     setSelectedId]     = useState(null)
  const [selectedView,   setSelectedView]   = useState('detail')
  const [viewOnly,       setViewOnly]       = useState(false)
  const [autoPayOrderId, setAutoPayOrderId] = useState(null)
  const [search,         setSearch]         = useState('')
  const [dateFrom,       setDateFrom]       = useState('')
  const [dateTo,         setDateTo]         = useState('')
  const [page,           setPage]           = useState(1)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await ordersApi.list({ status: filter, limit: 500 })
      const sorted = (data.orders || []).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      setOrders(sorted)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const id = setInterval(load, 15000)
    return () => clearInterval(id)
  }, [load])

  useEffect(() => {
    const openOrderId = location.state?.openOrderId
    const autoPay     = location.state?.autoPay
    if (!openOrderId) return
    setSelectedId(openOrderId)
    setSelectedView('detail')
    setViewOnly(false)
    setAutoPayOrderId(autoPay ? openOrderId : null)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])

  useEffect(() => { setPage(1) }, [filter, search, dateFrom, dateTo])

  async function handleAction(orderId, action) {
    if (action === 'reprint') {
      try {
        const d = await ordersApi.get(orderId)
        const order = d.data
        if (order?.payment) {
          printReceipt(
            { ...order, cashier: order.cashier, branch: user?.branch },
            order.payment,
            user?.branch?.name
          )
        }
      } catch (e) { console.error(e) }
      return
    }
    // Change 2: viewonly comes from menu now
    const isView = action === 'viewonly'
    setViewOnly(isView)
    setSelectedView(isView ? 'viewonly' : action)
    setSelectedId(orderId)
  }

  const filtered = orders.filter(order => {
    const q = search.toLowerCase()
    const matchesSearch = !q ||
      order.orderNumber?.toLowerCase().includes(q) ||
      order.customerName?.toLowerCase().includes(q) ||
      order.items?.some(i => i.menuItem?.name?.toLowerCase().includes(q))
    const createdAt   = new Date(order.createdAt)
    const matchesFrom = !dateFrom || createdAt >= new Date(dateFrom)
    const matchesTo   = !dateTo   || createdAt <= new Date(dateTo + 'T23:59:59')
    return matchesSearch && matchesFrom && matchesTo
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    // Change 3: match Dashboard layout — 95% width, maxWidth 1800, padding 28
    <div style={{ width: '95%', maxWidth: 1800, margin: '0 auto', padding: 28 }}>

      {/* Header — matches Dashboard h1 size and spacing */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontSize: 26, color: 'var(--brown-800)', marginBottom: 4 }}>
            Orders
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
            Completed and cancelled order history
          </p>
        </div>
      </div>

      {/* Toolbar: status tabs + search + date range — matches Dashboard controls row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {STATUSES.map(s => (
            <button key={s} onClick={() => setFilter(s)} style={{
              padding: '10px 18px', borderRadius: 'var(--radius-full)', border: 'none',
              background: filter === s ? 'var(--brown-600)' : 'var(--brown-100)',
              color:      filter === s ? '#fff' : 'var(--brown-800)',
              fontWeight: 700, fontSize: 12.5, cursor: 'pointer', transition: 'all 200ms ease',
              boxShadow: filter === s ? '0 4px 14px rgba(180,83,9,0.28)' : 'none',
            }}>{s}</button>
          ))}
        </div>

        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, pointerEvents: 'none' }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by order number, customer, or item…"
            style={{ ...inputStyle, paddingLeft: 32, boxSizing: 'border-box' }} />
          {search && (
            <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text-muted)' }}>✕</button>
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>From</span>
          <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '9px 12px', fontSize: 13 }} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700 }}>To</span>
          <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
            style={{ ...inputStyle, width: 'auto', padding: '9px 12px', fontSize: 13 }} />
          {(dateFrom || dateTo) && (
            <button onClick={() => { setDateFrom(''); setDateTo('') }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 600 }}>✕</button>
          )}
        </div>
      </div>

      {/* Results count */}
      {(search || dateFrom || dateTo) && (
        <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} found
        </div>
      )}

      {/* List — matches Dashboard section card style */}
      {loading && orders.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-faint)' }}>Loading orders...</div>
      ) : paginated.length === 0 ? (
        <EmptyState icon="📋" title={`No ${filter.toLowerCase()} orders`} subtitle="Orders will appear here" />
      ) : (
        <>
          <div style={{
            background: 'var(--cream)', border: '1.5px solid var(--border)',
            borderRadius: 'var(--radius-lg)', overflow: 'hidden',
            boxShadow: 'var(--shadow-sm)',
          }}>
            {/* List header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: '10px 18px', background: 'var(--brown-50)',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5,
            }}>
              <div style={{ width: 42, flexShrink: 0 }}>Menu</div>
              <div style={{ flex: 1 }}>Order</div>
              <div style={{ flexShrink: 0, minWidth: 90, textAlign: 'right' }}>Amount</div>
              <div style={{ flexShrink: 0, minWidth: 150, textAlign: 'right' }}>Date & Time</div>
              <div style={{ flexShrink: 0, width: 90, textAlign: 'right' }}>Status</div>
            </div>

            {paginated.map(order => (
              <OrderRow
                key={order.id}
                order={order}
                onAction={handleAction}
              />
            ))}
          </div>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </>
      )}

      {selectedId && (
        <OrderDetailModal
          orderId={selectedId}
          initialView={selectedView}
          viewOnly={viewOnly}
          autoOpenPay={autoPayOrderId === selectedId}
          onClose={() => { setSelectedId(null); setAutoPayOrderId(null); setViewOnly(false); load() }}
          onRefresh={load}
        />
      )}
    </div>
  )
}