import { useState, useEffect, useCallback } from "react";

// ─── CONFIG ───────────────────────────────────────────────
const API_BASE = "http://localhost:3000/api";

// ─── API HELPER ───────────────────────────────────────────
async function api(path, options = {}, token = null) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Request failed");
  return data;
}

// ─── ICONS (inline SVG) ───────────────────────────────────
const Icon = {
  logout: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
  cart:   <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>,
  plus:   <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  minus:  <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  trash:  <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>,
  check:  <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>,
  orders: <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>,
  close:  <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
};

// ─── STATUS BADGE ─────────────────────────────────────────
const STATUS_COLOR = {
  PENDING:    { bg: "#FEF3C7", color: "#92400E" },
  PREPARING:  { bg: "#DBEAFE", color: "#1E40AF" },
  READY:      { bg: "#D1FAE5", color: "#065F46" },
  COMPLETED:  { bg: "#F3F4F6", color: "#374151" },
  CANCELLED:  { bg: "#FEE2E2", color: "#991B1B" },
};

function Badge({ status }) {
  const s = STATUS_COLOR[status] || STATUS_COLOR.PENDING;
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: "2px 10px", borderRadius: 20,
      fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
      textTransform: "uppercase",
    }}>{status}</span>
  );
}

// ─── LOGIN SCREEN ─────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState("cashier1@sisigan.ph");
  const [password, setPassword] = useState("cashier123");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setLoading(true); setError("");
    try {
      const data = await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      onLogin(data.data.token, data.data.user);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      minHeight: "100vh", background: "#1a0a00",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontFamily: "'Georgia', serif",
    }}>
      <div style={{
        background: "#fff8f0", borderRadius: 16, padding: "48px 40px",
        width: 360, boxShadow: "0 24px 64px rgba(0,0,0,0.4)",
        textAlign: "center",
      }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>🍖</div>
        <h1 style={{ margin: "0 0 4px", fontSize: 26, color: "#7c2d12", fontWeight: 700 }}>
          Sisigan
        </h1>
        <p style={{ margin: "0 0 32px", color: "#a16207", fontSize: 13 }}>
          Point of Sale System
        </p>

        {error && (
          <div style={{ background: "#FEE2E2", color: "#991B1B", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
            {error}
          </div>
        )}

        <input
          value={email} onChange={e => setEmail(e.target.value)}
          placeholder="Email"
          style={inputStyle}
        />
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="Password" onKeyDown={e => e.key === "Enter" && handleLogin()}
          style={{ ...inputStyle, marginTop: 10 }}
        />
        <button onClick={handleLogin} disabled={loading} style={{
          width: "100%", marginTop: 20, padding: "13px",
          background: loading ? "#d97706" : "#b45309",
          color: "#fff", border: "none", borderRadius: 10,
          fontFamily: "Georgia, serif", fontSize: 15, fontWeight: 700,
          cursor: loading ? "not-allowed" : "pointer",
          transition: "background 0.2s",
        }}>
          {loading ? "Signing in…" : "Sign In"}
        </button>

        <p style={{ marginTop: 20, fontSize: 11, color: "#9CA3AF" }}>
          Admin: admin@sisigan.ph / admin123<br />
          Cashier: cashier1@sisigan.ph / cashier123
        </p>
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%", padding: "11px 14px", border: "1.5px solid #e5d0b0",
  borderRadius: 8, fontSize: 14, fontFamily: "Georgia, serif",
  background: "#fff", boxSizing: "border-box", outline: "none",
  color: "#1c1917",
};

// ─── PAYMENT MODAL ────────────────────────────────────────
function PaymentModal({ order, token, onClose, onPaid }) {
  const [method, setMethod] = useState("CASH");
  const [amountPaid, setAmountPaid] = useState("");
  const [refNo, setRefNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const total = Number(order.totalAmount);
  const paid = Number(amountPaid) || 0;
  const change = paid - total;

  async function handlePay() {
    setLoading(true); setError("");
    try {
      const result = await api(`/orders/${order.id}/payment`, {
        method: "POST",
        body: JSON.stringify({ method, amountPaid: paid, referenceNo: refNo || null }),
      }, token);
      onPaid(result.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{
        background: "#fff8f0", borderRadius: 16, padding: 32, width: 380,
        boxShadow: "0 24px 64px rgba(0,0,0,0.3)",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <h2 style={{ margin: 0, color: "#7c2d12", fontSize: 18 }}>Process Payment</h2>
          <button onClick={onClose} style={iconBtn}>{Icon.close}</button>
        </div>

        <div style={{ background: "#fef3c7", borderRadius: 10, padding: "12px 16px", marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#92400e", fontSize: 13 }}>Order {order.orderNumber}</span>
            <span style={{ color: "#92400e", fontWeight: 700, fontSize: 18 }}>₱{total.toFixed(2)}</span>
          </div>
        </div>

        <label style={labelStyle}>Payment Method</label>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {["CASH", "GCASH", "MAYA", "CARD"].map(m => (
            <button key={m} onClick={() => setMethod(m)} style={{
              flex: 1, padding: "8px 4px", border: `2px solid ${method === m ? "#b45309" : "#e5d0b0"}`,
              borderRadius: 8, background: method === m ? "#b45309" : "#fff",
              color: method === m ? "#fff" : "#78350f",
              fontSize: 12, fontWeight: 700, cursor: "pointer",
            }}>{m}</button>
          ))}
        </div>

        <label style={labelStyle}>Amount Paid (₱)</label>
        <input
          type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
          placeholder={`Min ₱${total.toFixed(2)}`}
          style={{ ...inputStyle, marginBottom: 12 }}
        />

        {method !== "CASH" && (
          <>
            <label style={labelStyle}>Reference No.</label>
            <input value={refNo} onChange={e => setRefNo(e.target.value)}
              placeholder="GCash / Maya / Card ref"
              style={{ ...inputStyle, marginBottom: 12 }}
            />
          </>
        )}

        {paid > 0 && (
          <div style={{
            background: change >= 0 ? "#D1FAE5" : "#FEE2E2",
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            display: "flex", justifyContent: "space-between",
          }}>
            <span style={{ color: change >= 0 ? "#065F46" : "#991B1B", fontSize: 13 }}>
              {change >= 0 ? "Change" : "Short by"}
            </span>
            <span style={{ color: change >= 0 ? "#065F46" : "#991B1B", fontWeight: 700 }}>
              ₱{Math.abs(change).toFixed(2)}
            </span>
          </div>
        )}

        {error && <div style={{ color: "#dc2626", fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button onClick={handlePay} disabled={loading || paid < total} style={{
          width: "100%", padding: "13px", background: paid >= total ? "#15803d" : "#9CA3AF",
          color: "#fff", border: "none", borderRadius: 10,
          fontSize: 15, fontWeight: 700, cursor: paid >= total ? "pointer" : "not-allowed",
        }}>
          {loading ? "Processing…" : "Confirm Payment"}
        </button>
      </div>
    </div>
  );
}

const labelStyle = { display: "block", fontSize: 12, color: "#78350f", fontWeight: 700, marginBottom: 6, letterSpacing: 0.5, textTransform: "uppercase" };
const iconBtn = { background: "none", border: "none", cursor: "pointer", color: "#78350f", padding: 4, display: "flex", alignItems: "center" };

// ─── ORDER DETAIL MODAL ───────────────────────────────────
function OrderModal({ order, token, onClose, onRefresh }) {
  const [loading, setLoading] = useState(false);
  const [showPay, setShowPay] = useState(false);

  const NEXT = { PENDING: "PREPARING", PREPARING: "READY", READY: "COMPLETED" };
  const nextStatus = NEXT[order.status];

  async function advance() {
    if (!nextStatus) return;
    setLoading(true);
    try {
      await api(`/orders/${order.id}/status`, {
        method: "PATCH", body: JSON.stringify({ status: nextStatus }),
      }, token);
      onRefresh();
    } finally { setLoading(false); }
  }

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 100,
    }}>
      <div style={{ background: "#fff8f0", borderRadius: 16, padding: 28, width: 420, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontWeight: 700, color: "#7c2d12", fontSize: 17 }}>{order.orderNumber}</div>
            <div style={{ fontSize: 12, color: "#a16207", marginTop: 2 }}>
              {order.type} {order.tableNumber ? `· Table ${order.tableNumber}` : ""} {order.customerName ? `· ${order.customerName}` : ""}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Badge status={order.status} />
            <button onClick={onClose} style={iconBtn}>{Icon.close}</button>
          </div>
        </div>

        {/* Items */}
        <div style={{ borderTop: "1px solid #e5d0b0", paddingTop: 12, marginBottom: 12 }}>
          {order.items?.map(item => (
            <div key={item.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid #fef3c7" }}>
              <div>
                <div style={{ fontSize: 14, color: "#1c1917" }}>{item.menuItem?.name}</div>
                {item.notes && <div style={{ fontSize: 11, color: "#9CA3AF" }}>{item.notes}</div>}
              </div>
              <div style={{ textAlign: "right", fontSize: 13, color: "#78350f" }}>
                x{item.quantity}<br />
                <span style={{ fontWeight: 700 }}>₱{Number(item.subtotal).toFixed(2)}</span>
              </div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 16, color: "#7c2d12", padding: "8px 0 16px" }}>
          <span>Total</span>
          <span>₱{Number(order.totalAmount).toFixed(2)}</span>
        </div>

        {/* Payment info */}
        {order.payment && (
          <div style={{ background: "#D1FAE5", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13 }}>
            <div style={{ color: "#065F46", fontWeight: 700, marginBottom: 4 }}>✓ Paid via {order.payment.method}</div>
            <div style={{ color: "#065F46" }}>Paid: ₱{Number(order.payment.amountPaid).toFixed(2)} · Change: ₱{Number(order.payment.change).toFixed(2)}</div>
          </div>
        )}

        {/* Actions */}
        {order.status !== "COMPLETED" && order.status !== "CANCELLED" && (
          <div style={{ display: "flex", gap: 10 }}>
            {nextStatus && nextStatus !== "COMPLETED" && (
              <button onClick={advance} disabled={loading} style={{
                flex: 1, padding: "11px", background: "#b45309", color: "#fff",
                border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer",
              }}>
                {loading ? "…" : `Mark ${nextStatus}`}
              </button>
            )}
            {order.status === "READY" && !order.payment && (
              <button onClick={() => setShowPay(true)} style={{
                flex: 1, padding: "11px", background: "#15803d", color: "#fff",
                border: "none", borderRadius: 10, fontWeight: 700, cursor: "pointer",
              }}>
                💳 Pay Now
              </button>
            )}
          </div>
        )}
      </div>

      {showPay && (
        <PaymentModal
          order={order} token={token}
          onClose={() => setShowPay(false)}
          onPaid={() => { setShowPay(false); onRefresh(); onClose(); }}
        />
      )}
    </div>
  );
}

// ─── NEW ORDER PANEL ──────────────────────────────────────
function NewOrderPanel({ menu, token, onCreated }) {
  const [cart, setCart] = useState([]);
  const [type, setType] = useState("DINE_IN");
  const [table, setTable] = useState("");
  const [customer, setCustomer] = useState("");
  const [activeCategory, setActiveCategory] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (menu?.length && !activeCategory) setActiveCategory(menu[0].id);
  }, [menu]);

  const totalAmount = cart.reduce((s, i) => s + i.quantity * Number(i.price), 0);
  const currentCategory = menu?.find(c => c.id === activeCategory);

  function addItem(item) {
    setCart(prev => {
      const exists = prev.find(i => i.id === item.id);
      if (exists) return prev.map(i => i.id === item.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...item, quantity: 1 }];
    });
  }

  function adjustQty(id, delta) {
    setCart(prev => prev.map(i => i.id === id ? { ...i, quantity: i.quantity + delta } : i).filter(i => i.quantity > 0));
  }

  async function submitOrder() {
    if (!cart.length) return;
    setLoading(true); setError("");
    try {
      const result = await api("/orders", {
        method: "POST",
        body: JSON.stringify({
          type, tableNumber: table || null, customerName: customer || null,
          items: cart.map(i => ({ menuItemId: i.id, quantity: i.quantity })),
        }),
      }, token);
      setCart([]); setTable(""); setCustomer("");
      onCreated(result.data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", height: "100%", gap: 0 }}>
      {/* Left: Menu */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Category tabs */}
        <div style={{ display: "flex", gap: 6, padding: "12px 16px", overflowX: "auto", background: "#fff8f0", borderBottom: "1px solid #e5d0b0" }}>
          {menu?.map(cat => (
            <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
              padding: "7px 16px", borderRadius: 20,
              border: "none", whiteSpace: "nowrap",
              background: activeCategory === cat.id ? "#b45309" : "#fef3c7",
              color: activeCategory === cat.id ? "#fff" : "#92400e",
              fontWeight: 700, fontSize: 12, cursor: "pointer",
            }}>{cat.name}</button>
          ))}
        </div>

        {/* Items grid */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, alignContent: "start" }}>
          {currentCategory?.items.map(item => {
            const inCart = cart.find(i => i.id === item.id);
            return (
              <div key={item.id} onClick={() => addItem(item)} style={{
                background: inCart ? "#fef3c7" : "#fff",
                border: `2px solid ${inCart ? "#b45309" : "#e5d0b0"}`,
                borderRadius: 12, padding: "14px 12px", cursor: "pointer",
                transition: "all 0.15s",
              }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1c1917", marginBottom: 4, lineHeight: 1.3 }}>{item.name}</div>
                <div style={{ fontSize: 14, color: "#b45309", fontWeight: 700 }}>₱{Number(item.price).toFixed(0)}</div>
                {inCart && <div style={{ fontSize: 11, color: "#b45309", marginTop: 4 }}>x{inCart.quantity} in cart</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Right: Cart */}
      <div style={{ width: 280, borderLeft: "1px solid #e5d0b0", background: "#fffdf9", display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "14px 16px", borderBottom: "1px solid #e5d0b0" }}>
          <div style={{ fontWeight: 700, color: "#7c2d12", marginBottom: 10, fontSize: 14 }}>Order Details</div>

          {/* Type selector */}
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            {["DINE_IN", "TAKEOUT"].map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: "6px", border: `2px solid ${type === t ? "#b45309" : "#e5d0b0"}`,
                borderRadius: 8, background: type === t ? "#b45309" : "#fff",
                color: type === t ? "#fff" : "#78350f",
                fontSize: 11, fontWeight: 700, cursor: "pointer",
              }}>{t === "DINE_IN" ? "Dine In" : "Takeout"}</button>
            ))}
          </div>

          <input value={table} onChange={e => setTable(e.target.value)}
            placeholder="Table No. (optional)"
            style={{ ...inputStyle, marginBottom: 8, fontSize: 13, padding: "8px 12px" }}
          />
          <input value={customer} onChange={e => setCustomer(e.target.value)}
            placeholder="Customer name (optional)"
            style={{ ...inputStyle, fontSize: 13, padding: "8px 12px" }}
          />
        </div>

        {/* Cart items */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {cart.length === 0 ? (
            <div style={{ textAlign: "center", color: "#d1c0a0", marginTop: 40, fontSize: 13 }}>
              {Icon.cart}<br />Tap items to add
            </div>
          ) : cart.map(item => (
            <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "8px 0", borderBottom: "1px solid #fef3c7", gap: 6 }}>
              <div style={{ flex: 1, fontSize: 12, color: "#1c1917", lineHeight: 1.3 }}>{item.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <button onClick={() => adjustQty(item.id, -1)} style={{ ...qtyBtn, background: "#fef3c7" }}>{Icon.minus}</button>
                <span style={{ width: 20, textAlign: "center", fontSize: 13, fontWeight: 700 }}>{item.quantity}</span>
                <button onClick={() => adjustQty(item.id, 1)} style={{ ...qtyBtn, background: "#fef3c7" }}>{Icon.plus}</button>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#b45309", minWidth: 48, textAlign: "right" }}>
                ₱{(item.quantity * Number(item.price)).toFixed(0)}
              </div>
            </div>
          ))}
        </div>

        {/* Total + Submit */}
        <div style={{ padding: "12px 16px", borderTop: "1px solid #e5d0b0" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12, fontWeight: 700, color: "#7c2d12" }}>
            <span>Total</span>
            <span style={{ fontSize: 18 }}>₱{totalAmount.toFixed(2)}</span>
          </div>
          {error && <div style={{ color: "#dc2626", fontSize: 12, marginBottom: 8 }}>{error}</div>}
          <button onClick={submitOrder} disabled={loading || cart.length === 0} style={{
            width: "100%", padding: "12px", background: cart.length ? "#b45309" : "#e5d0b0",
            color: cart.length ? "#fff" : "#9CA3AF",
            border: "none", borderRadius: 10, fontWeight: 700, fontSize: 14,
            cursor: cart.length ? "pointer" : "not-allowed",
          }}>
            {loading ? "Placing…" : "Place Order"}
          </button>
        </div>
      </div>
    </div>
  );
}

const qtyBtn = { width: 24, height: 24, border: "none", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, color: "#78350f" };

// ─── ORDERS LIST ──────────────────────────────────────────
function OrdersList({ token, user, refresh }) {
  const [orders, setOrders] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("PENDING");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api(`/orders?status=${filter}&limit=50`, {}, token);
      setOrders(data.orders || []);
    } finally { setLoading(false); }
  }, [token, filter]);

  useEffect(() => { load(); }, [load, refresh]);

  const reloadAndClose = () => { setSelected(null); load(); };

  return (
    <div style={{ padding: 20, maxWidth: 900, margin: "0 auto" }}>
      {/* Filter tabs */}
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED"].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            padding: "7px 16px", borderRadius: 20, border: "none",
            background: filter === s ? "#b45309" : "#fef3c7",
            color: filter === s ? "#fff" : "#92400e",
            fontWeight: 700, fontSize: 12, cursor: "pointer",
          }}>{s}</button>
        ))}
      </div>

      {loading && <div style={{ color: "#a16207", textAlign: "center", padding: 40 }}>Loading orders…</div>}

      {!loading && orders.length === 0 && (
        <div style={{ textAlign: "center", color: "#d1c0a0", padding: 60, fontSize: 14 }}>
          No {filter.toLowerCase()} orders
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 12 }}>
        {orders.map(order => (
          <div key={order.id} onClick={() => setSelected(order)} style={{
            background: "#fff8f0", border: "1.5px solid #e5d0b0",
            borderRadius: 12, padding: "16px", cursor: "pointer",
            transition: "box-shadow 0.15s",
          }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(180,83,9,0.15)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontWeight: 700, color: "#7c2d12" }}>{order.orderNumber}</span>
              <Badge status={order.status} />
            </div>
            <div style={{ fontSize: 12, color: "#a16207", marginBottom: 8 }}>
              {order.type} {order.tableNumber ? `· T${order.tableNumber}` : ""} {order.customerName ? `· ${order.customerName}` : ""}
            </div>
            <div style={{ fontSize: 13, color: "#78350f" }}>
              {order.items?.length} item(s)
            </div>
            <div style={{ marginTop: 8, fontWeight: 700, color: "#b45309", fontSize: 15 }}>
              ₱{Number(order.totalAmount).toFixed(2)}
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: "#9CA3AF" }}>
              {new Date(order.createdAt).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
              {" · "}{order.cashier?.name}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <OrderModal
          order={selected} token={token}
          onClose={reloadAndClose}
          onRefresh={reloadAndClose}
        />
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [menu, setMenu] = useState([]);
  const [tab, setTab] = useState("new");
  const [refreshOrders, setRefreshOrders] = useState(0);

  function handleLogin(t, u) { setToken(t); setUser(u); }
  function handleLogout() { setToken(null); setUser(null); setMenu([]); }

  useEffect(() => {
    if (!token) return;
    api("/menu/categories", {}, token).then(d => setMenu(d.data || []));
  }, [token]);

  function handleOrderCreated(order) {
    setTab("orders");
    setRefreshOrders(r => r + 1);
  }

  if (!token) return <LoginScreen onLogin={handleLogin} />;

  return (
    <div style={{ minHeight: "100vh", background: "#f9f3ec", fontFamily: "Georgia, serif" }}>
      {/* Top Nav */}
      <div style={{
        background: "#7c2d12", color: "#fff",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "0 20px", height: 52, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 20 }}>🍖</span>
          <span style={{ fontWeight: 700, fontSize: 16 }}>Sisigan POS</span>
          <span style={{ background: "#fef3c7", color: "#92400e", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>
            {user?.branch?.name}
          </span>
        </div>

        {/* Nav tabs */}
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { id: "new", label: "New Order", icon: Icon.cart },
            { id: "orders", label: "Orders", icon: Icon.orders },
          ].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 16px", borderRadius: 8, border: "none",
              background: tab === t.id ? "rgba(255,255,255,0.2)" : "transparent",
              color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer",
            }}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "#fde68a" }}>{user?.name} · {user?.role}</span>
          <button onClick={handleLogout} style={{ ...iconBtn, color: "#fde68a" }}>{Icon.logout}</button>
        </div>
      </div>

      {/* Content */}
      <div style={{ height: "calc(100vh - 52px)", overflow: "hidden" }}>
        {tab === "new" && (
          <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
            <NewOrderPanel menu={menu} token={token} onCreated={handleOrderCreated} />
          </div>
        )}
        {tab === "orders" && (
          <div style={{ height: "100%", overflowY: "auto" }}>
            <OrdersList token={token} user={user} refresh={refreshOrders} />
          </div>
        )}
      </div>
    </div>
  );
}
