// src/components/layout/NotificationCenter.jsx
import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useNotifications } from '../../context/NotificationContext'
import { useAuth } from '../../context/AuthContext'

const SEVERITY_META = {
  CRITICAL: {
    label: 'Critical',
    bg: '#fef2f2',
    border: '#fecaca',
    badgeBg: '#dc2626',
    badgeText: '#ffffff',
    text: '#991b1b',
  },
  WARNING: {
    label: 'Warning',
    bg: '#fffbeb',
    border: '#fde68a',
    badgeBg: '#d97706',
    badgeText: '#ffffff',
    text: '#92400e',
  },
  RECOVERY: {
    label: 'Restocked',
    bg: '#f0fdf4',
    border: '#bbf7d0',
    badgeBg: '#16a34a',
    badgeText: '#ffffff',
    text: '#166534',
  },
  INFO: {
    label: 'Info',
    bg: '#eff6ff',
    border: '#bfdbfe',
    badgeBg: '#2563eb',
    badgeText: '#ffffff',
    text: '#1e40af',
  },
}

function SeverityIcon({ severity }) {
  if (severity === 'CRITICAL') {
    // Package-X icon
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14" />
        <path d="m7.5 4.27 9 5.15" />
        <polyline points="3.29 7 12 12 20.71 7" />
        <line x1="12" y1="22" x2="12" y2="12" />
        <path d="m17 13 5 5m-5 0 5-5" />
      </svg>
    )
  }
  if (severity === 'WARNING') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
    )
  }
  if (severity === 'RECOVERY') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
    )
  }
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  )
}

function formatQty(val) {
  if (val == null) return null
  const num = Number(val)
  return Number.isInteger(num) ? String(num) : num.toFixed(3).replace(/\.?0+$/, '')
}

function formatTimestamp(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('en-PH', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

export default function NotificationCenter() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const {
    notifications,
    unreadCount,
    counts,
    markAsRead,
    markAllAsRead,
    refreshNotifications,
  } = useNotifications()

  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('ALL') // ALL | CRITICAL | WARNING | INFO | RECOVERY
  const [showResolved, setShowResolved] = useState(true)
  const containerRef = useRef(null)

  useEffect(() => {
    function handleOutsideClick(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [open])

  const filtered = notifications.filter((n) => {
    if (!showResolved && n.isResolved && n.severity !== 'RECOVERY') return false
    if (filter === 'ALL') return true
    if (filter === 'RECOVERY') return n.severity === 'RECOVERY' || n.isResolved
    return n.severity === filter
  })

  const canViewInventory = user?.role === 'OWNER' || user?.role === 'MANAGER'

  async function handleViewAction(notif) {
    if (!notif.isRead) {
      await markAsRead(notif.id)
    }
    setOpen(false)
    if (canViewInventory) {
      navigate(notif.actionUrl || '/inventory')
    } else {
      navigate('/pos')
    }
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          const next = !open
          setOpen(next)
          if (next) refreshNotifications()
        }}
        style={{
          position: 'relative',
          width: 40,
          height: 40,
          borderRadius: '50%',
          border: '1.5px solid rgba(255,255,255,0.28)',
          background: open ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.12)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          transition: 'background 180ms ease',
        }}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 19,
              height: 19,
              padding: '0 5px',
              borderRadius: '999px',
              background: counts?.activeCriticalCount > 0 ? '#dc2626' : '#f59e0b',
              color: '#fff',
              fontSize: 10.5,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '2px solid var(--brown-600)',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 10px)',
            right: 0,
            width: 'min(420px, 92vw)',
            maxHeight: '78vh',
            background: '#fff',
            borderRadius: '14px',
            boxShadow: '0 18px 45px rgba(28, 10, 0, 0.28)',
            border: '1px solid var(--border)',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--border)',
            background: 'var(--cream)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 8,
          }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--brown-900)' }}>
                Notification Center
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {unreadCount} unread · {counts?.activeCriticalCount || 0} critical · {counts?.activeWarningCount || 0} warning
              </div>
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllAsRead}
                style={{
                  border: '1px solid var(--border)',
                  background: '#fff',
                  color: 'var(--brown-700)',
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '5px 10px',
                  borderRadius: '8px',
                  cursor: 'pointer',
                }}
              >
                Mark all as read
              </button>
            )}
          </div>

          {/* Filter Tabs */}
          <div style={{
            padding: '8px 12px',
            borderBottom: '1px solid var(--border-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 6,
            flexWrap: 'wrap',
            background: '#faf8f5',
          }}>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {[
                { id: 'ALL', label: 'All' },
                { id: 'CRITICAL', label: 'Critical' },
                { id: 'WARNING', label: 'Warnings' },
                { id: 'INFO', label: 'Info' },
                { id: 'RECOVERY', label: 'Resolved' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setFilter(tab.id)}
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '4px 9px',
                    borderRadius: '999px',
                    border: 'none',
                    cursor: 'pointer',
                    background: filter === tab.id ? 'var(--brown-600)' : 'transparent',
                    color: filter === tab.id ? '#fff' : 'var(--brown-700)',
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />
              History
            </label>
          </div>

          {/* Notification List */}
          <div style={{ overflowY: 'auto', flex: 1, padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {filtered.length === 0 ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                No notifications in this category.
              </div>
            ) : (
              filtered.map((n) => {
                const meta = SEVERITY_META[n.severity] || SEVERITY_META.INFO
                const qtyDisplay = formatQty(n.currentQty)
                const thresholdDisplay = formatQty(n.minThreshold)

                return (
                  <div
                    key={n.id}
                    style={{
                      padding: '11px 12px',
                      borderRadius: '10px',
                      background: n.isRead ? '#ffffff' : meta.bg,
                      border: `1.5px solid ${n.isRead ? 'var(--border-light)' : meta.border}`,
                      opacity: n.isResolved && n.severity !== 'RECOVERY' ? 0.78 : 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 6,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ flexShrink: 0, display: 'inline-flex' }}>
                          <SeverityIcon severity={n.severity} />
                        </span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--brown-900)' }}>
                              {n.title}
                            </span>
                            <span style={{
                              fontSize: 10,
                              fontWeight: 800,
                              padding: '2px 6px',
                              borderRadius: '999px',
                              background: meta.badgeBg,
                              color: meta.badgeText,
                              textTransform: 'uppercase',
                            }}>
                              {meta.label}
                            </span>
                            {n.isResolved && n.severity !== 'RECOVERY' && (
                              <span style={{
                                fontSize: 10,
                                fontWeight: 700,
                                padding: '2px 6px',
                                borderRadius: '999px',
                                background: '#e5e7eb',
                                color: '#374151',
                              }}>
                                Resolved
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {!n.isRead && (
                        <span
                          title="Unread"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            background: meta.badgeBg,
                            flexShrink: 0,
                            marginTop: 5,
                          }}
                        />
                      )}
                    </div>

                    <div style={{ fontSize: 12.5, color: 'var(--brown-800)', lineHeight: 1.4 }}>
                      {n.message}
                    </div>

                    {/* Metadata chips: Branch, Item, Qty & Threshold */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, fontSize: 11 }}>
                      {n.branchName && (
                        <span style={{
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: 'var(--brown-100)',
                          color: 'var(--brown-800)',
                          fontWeight: 700,
                        }}>
                          📍 {n.branchName}
                        </span>
                      )}
                      {n.itemName && (
                        <span style={{
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: '#f3f4f6',
                          color: '#1f2937',
                          fontWeight: 600,
                        }}>
                          {n.itemName}
                        </span>
                      )}
                      {qtyDisplay !== null && (
                        <span style={{
                          padding: '2px 7px',
                          borderRadius: '6px',
                          background: Number(n.currentQty) <= 0 ? '#fee2e2' : '#f3f4f6',
                          color: Number(n.currentQty) <= 0 ? '#991b1b' : '#1f2937',
                          fontWeight: 700,
                        }}>
                          Stock: {qtyDisplay} {n.unit || ''}
                          {n.type === 'LOW_STOCK' && thresholdDisplay ? ` (Min: ${thresholdDisplay})` : ''}
                        </span>
                      )}
                    </div>

                    {/* Footer: Timestamp & Actions */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginTop: 2,
                      paddingTop: 6,
                      borderTop: '1px dashed var(--border-light)',
                      gap: 8,
                    }}>
                      <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                        {formatTimestamp(n.createdAt)}
                      </span>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {!n.isRead && (
                          <button
                            type="button"
                            onClick={() => markAsRead(n.id)}
                            style={{
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text-muted)',
                              fontSize: 11,
                              fontWeight: 700,
                              cursor: 'pointer',
                              padding: 0,
                            }}
                          >
                            Mark read
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleViewAction(n)}
                          style={{
                            border: 'none',
                            background: 'var(--brown-600)',
                            color: '#fff',
                            fontSize: 11,
                            fontWeight: 700,
                            padding: '4px 9px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                          }}
                        >
                          {canViewInventory ? 'View Inventory' : 'View POS'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
