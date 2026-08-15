// src/components/ui/index.jsx
// Shared UI primitives used across pages

// ─── STATUS BADGE ─────────────────────────────────────────
const STATUS_STYLES = {
  PENDING:   { bg: '#FEF3C7', color: '#92400E' },
  PREPARING: { bg: '#DBEAFE', color: '#1E40AF' },
  READY:     { bg: '#D1FAE5', color: '#065F46' },
  COMPLETED: { bg: '#F3F4F6', color: '#374151' },
  CANCELLED: { bg: '#FEE2E2', color: '#991B1B' },
}

export function Badge({ status }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.PENDING
  return (
    <span style={{
      background: s.bg, color: s.color,
      padding: '4px 12px', borderRadius: 'var(--radius-full)',
      fontSize: 11, fontWeight: 700, letterSpacing: 0.6,
      textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{status}</span>
  )
}

// ─── BUTTON ───────────────────────────────────────────────
const BTN_VARIANTS = {
  primary:   { bg: 'var(--gradient-primary)', bgHover: 'var(--gradient-primary-hover)', color: '#fff', border: 'none', shadow: '0 4px 14px rgba(180,83,9,0.28)' },
  success:   { bg: 'var(--green)',    bgHover: '#166534', color: '#fff', border: 'none', shadow: '0 4px 14px rgba(21,128,61,0.25)' },
  danger:    { bg: 'var(--red)',      bgHover: '#b91c1c', color: '#fff', border: 'none', shadow: '0 4px 14px rgba(220,38,38,0.25)' },
  ghost:     { bg: 'transparent',     bgHover: 'var(--brown-50)', color: 'var(--brown-600)', border: 'none', shadow: 'none' },
  outline:   { bg: '#fff',            bgHover: 'var(--brown-50)', color: 'var(--brown-700)', border: '1.5px solid var(--border)', shadow: 'none' },
  secondary: { bg: 'var(--brown-100)',bgHover: 'var(--brown-300)', color: 'var(--brown-800)', border: 'none', shadow: 'none' },
}

export function Button({ children, variant = 'primary', size = 'md', disabled, onClick, style = {}, fullWidth }) {
  const v = BTN_VARIANTS[variant] || BTN_VARIANTS.primary
  const padding = size === 'sm' ? '9px 16px' : size === 'lg' ? '14px 26px' : '11px 20px'
  const fontSize = size === 'sm' ? 12.5 : size === 'lg' ? 15 : 13.5

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding, fontSize, fontWeight: 700,
        background: disabled ? '#e5e7eb' : v.bg,
        color: disabled ? '#9ca3af' : v.color,
        border: disabled ? '1.5px solid #e5e7eb' : v.border,
        borderRadius: 'var(--radius-full)',
        boxShadow: disabled ? 'none' : v.shadow,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all var(--transition-fast)',
        width: fullWidth ? '100%' : undefined,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        transform: 'translateY(0)',
        ...style,
      }}
      onMouseEnter={e => {
        if (disabled) return
        e.currentTarget.style.background = v.bgHover
        e.currentTarget.style.transform = 'translateY(-1px)'
      }}
      onMouseLeave={e => {
        if (disabled) return
        e.currentTarget.style.background = v.bg
        e.currentTarget.style.transform = 'translateY(0)'
      }}
    >
      {children}
    </button>
  )
}

// ─── INPUT ────────────────────────────────────────────────
export function Input({ label, error, style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </label>
      )}
      <input
        {...props}
        style={{
          padding: '12px 14px', border: `1.5px solid ${error ? 'var(--red)' : 'var(--border)'}`,
          borderRadius: 'var(--radius-md)', fontSize: 14.5,
          background: '#fff', color: 'var(--text-dark)', outline: 'none',
          transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
          ...style,
        }}
        onFocus={e => {
          e.target.style.borderColor = 'var(--brown-600)'
          e.target.style.boxShadow = '0 0 0 3px rgba(180,83,9,0.12)'
        }}
        onBlur={e => {
          e.target.style.borderColor = error ? 'var(--red)' : 'var(--border)'
          e.target.style.boxShadow = 'none'
        }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--red)' }}>{error}</span>}
    </div>
  )
}

// ─── SELECT ───────────────────────────────────────────────
export function Select({ label, options = [], style = {}, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          {label}
        </label>
      )}
      <select
        {...props}
        style={{
          padding: '12px 14px', border: '1.5px solid var(--border)',
          borderRadius: 'var(--radius-md)', fontSize: 14.5,
          background: '#fff', color: 'var(--text-dark)', outline: 'none',
          cursor: 'pointer',
          ...style,
        }}
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}

// ─── MODAL ────────────────────────────────────────────────
export function Modal({ title, onClose, children, width = 440 }) {
  return (
    <div
      className="animate-fade"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(28, 10, 0, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div className="animate-slide" style={{
        background: 'var(--cream)', borderRadius: 'var(--radius-xl)',
        padding: 28, width, maxWidth: '100%',
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: 'var(--shadow-xl)',
        border: '1px solid var(--border-light)',
      }}>
        {title && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 19, color: 'var(--brown-800)' }}>{title}</h2>
            <button onClick={onClose} style={{
              background: 'var(--brown-50)', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', fontSize: 16, lineHeight: 1, padding: 8,
              borderRadius: '50%', width: 30, height: 30,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background var(--transition-fast)',
            }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--brown-100)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--brown-50)'}
            >✕</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

// ─── CARD ─────────────────────────────────────────────────
export function Card({ children, style = {}, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--cream)', border: '1.5px solid var(--border)',
        borderRadius: 'var(--radius-lg)', padding: 20,
        boxShadow: 'var(--shadow-sm)',
        cursor: onClick ? 'pointer' : 'default',
        transition: onClick ? 'box-shadow var(--transition-fast), border-color var(--transition-fast), transform var(--transition-fast)' : undefined,
        ...style,
      }}
      onMouseEnter={onClick ? e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
        e.currentTarget.style.borderColor = 'var(--brown-300)'
        e.currentTarget.style.transform = 'translateY(-2px)'
      } : undefined}
      onMouseLeave={onClick ? e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.transform = 'translateY(0)'
      } : undefined}
    >
      {children}
    </div>
  )
}

// ─── EMPTY STATE ──────────────────────────────────────────
export function EmptyState({ icon = '📋', title, subtitle }) {
  return (
    <div style={{
      textAlign: 'center', padding: '72px 24px', color: 'var(--text-faint)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>{icon}</div>
      <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 8, color: 'var(--text-muted)' }}>{title}</div>
      {subtitle && <div style={{ fontSize: 13.5, maxWidth: 360 }}>{subtitle}</div>}
    </div>
  )
}

// ─── SPINNER ──────────────────────────────────────────────
export function Spinner({ size = 24, color = 'var(--brown-600)' }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid var(--border)`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: 'spin 0.7s linear infinite',
    }} />
  )
}