import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useIsMobile } from '../../hooks/useIsMobile'

import logo from '../../assets/LOGO/logo.jpg'
import allorder from '../../assets/ICONS/allorder.png'
import analytics from '../../assets/ICONS/analytics.png'
import dashboard from '../../assets/ICONS/dashboard.png'
import branches from '../../assets/ICONS/branches.png'
import acc from '../../assets/ICONS/account.png'
import menu from '../../assets/ICONS/menu.png'
import orders from '../../assets/ICONS/orders.png'
import order from '../../assets/ICONS/order.png'
import inventory from '../../assets/ICONS/inventory.png'

export default function Navbar() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  // ADDED — mobile nav collapses behind a hamburger toggle. Breakpoint is
  // 1024 (not the usual 768) because with up to 8 nav pills (OWNER role)
  // plus the logo and user info, anything narrower than ~1050px doesn't
  // have room to fit them on one line — they'd wrap to a second row and
  // overflow outside the fixed-height navbar, overlapping page content
  // below it. 1024 also conveniently covers tablets, which is a plus
  // since this POS is likely used on a tablet at the counter too.
  const isMobile = useIsMobile(1024)
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleLogout() {
    await logout()
    navigate('/login')
  }

  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: dashboard, roles: ['OWNER', 'MANAGER', 'CASHIER'] },
    { to: '/analytics', label: 'Analytics', icon: analytics, roles: ['OWNER'] },
    { to: '/inventory', label: 'Inventory', icon: inventory, roles: ['OWNER', 'MANAGER'] },
    { to: '/pos',       label: 'New Order', icon: order, roles: ['MANAGER', 'CASHIER'] },
    { to: '/orders',    label: 'Orders',    icon: orders, roles: ['MANAGER', 'CASHIER'] },
    { to: '/menu',      label: 'Menu',      icon: menu, roles: ['OWNER', 'MANAGER'] },
    { to: '/branches',  label: 'Branches',  icon: branches, roles: ['OWNER'] },
    { to: '/users',     label: 'Accounts',  icon: acc, roles: ['OWNER', 'MANAGER'] },
  ].filter(item => item.roles.includes(user?.role))

  // CHANGED — on mobile, nav links close the menu on tap so the drawer
  // doesn't stay open after navigating.
  function handleNavClick() {
    if (isMobile) setMenuOpen(false)
  }

  const navLinkStyle = ({ isActive }) => ({
    display: 'flex', alignItems: 'center', gap: 9,
    padding: isMobile ? '13px 16px' : '11px 20px',
    borderRadius: isMobile ? 'var(--radius-md)' : 'var(--radius-full)',
    textDecoration: 'none', fontSize: isMobile ? 15 : 14, fontWeight: 600,
    background: isActive ? 'rgba(255,255,255,0.22)' : 'transparent',
    color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
    boxShadow: isActive ? '0 2px 10px rgba(0,0,0,0.15)' : 'none',
    transition: 'background 220ms ease, color 220ms ease, box-shadow 220ms ease, transform 180ms ease',
    whiteSpace: 'nowrap',
    width: isMobile ? '100%' : undefined,
  })

  return (
    <nav style={{
      background: 'linear-gradient(180deg,var(--brown-500),var(--brown-600))',
      boxShadow: '0 2px 14px rgba(28,10,0,0.25)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* ── Top bar: logo + (desktop) full nav, or (mobile) hamburger ──── */}
      <div style={{
        height: 'var(--nav-height)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '0 14px' : '0 28px',
      }}>
        {/* ── Logo section ───────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 14, flexShrink: 0, minWidth: 0 }}>
          <img
            src={logo}
            alt="Harvey's Sisig Logo"
            style={{
              height: isMobile ? 38 : 46, width: isMobile ? 38 : 46, objectFit: 'cover',
              borderRadius: 'var(--radius-md)', flexShrink: 0,
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15, minWidth: 0 }}>
            <span style={{
              fontFamily: 'Georgia', color: '#fff',
              fontSize: isMobile ? 14.5 : 19, fontWeight: 700,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {/* CHANGED — shortened name on mobile so it doesn't force horizontal scroll on narrow phones */}
              {isMobile ? "Harvey's Sisig" : "Harvey's Special Crispy Sisig"}
            </span>
            <span style={{
              display: 'inline-flex', alignSelf: 'flex-start', marginTop: 4,
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              fontSize: isMobile ? 10 : 11, fontWeight: 700, padding: isMobile ? '2px 10px' : '3px 12px',
              borderRadius: 'var(--radius-full)', letterSpacing: 0.3, whiteSpace: 'nowrap',
            }}>
              {user?.role === 'OWNER' ? 'All Branches' : (user?.branch?.name || 'POS')}
            </span>
          </div>
        </div>

        {/* ── Desktop: nav pills inline ──────────────────── */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
            {navItems.map(item => (
              <NavLink
                key={item.to}
                to={item.to}
                style={navLinkStyle}
                onMouseEnter={e => {
                  if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                    e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                    e.currentTarget.style.color = '#fff'
                  }
                }}
                onMouseLeave={e => {
                  if (e.currentTarget.getAttribute('aria-current') !== 'page') {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = 'rgba(255,255,255,0.72)'
                  }
                }}
              >
                <img src={item.icon} alt="" style={{ width: 19, height: 19, objectFit: 'contain', flexShrink: 0 }} />
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        )}

        {/* ── Desktop: owner/sign-out section ────────────── */}
        {!isMobile && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: '50%',
                background: 'rgba(255,255,255,0.18)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, flexShrink: 0,
              }}>
                👤
              </div>
              <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
                <div style={{ color: '#fff', fontSize: 13.5, fontWeight: 700 }}>{user?.name}</div>
                <div style={{
                  color: 'rgba(255,255,255,0.75)', fontSize: 10.5, fontWeight: 700,
                  textTransform: 'uppercase', letterSpacing: 0.6,
                }}>
                  {user?.role}
                </div>
              </div>
            </div>

            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)',
                color: '#fff', padding: '9px 18px',
                borderRadius: 'var(--radius-full)',
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                transition: 'all 200ms ease',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = 'rgba(220,38,38,0.85)'
                e.currentTarget.style.borderColor = 'rgba(220,38,38,0.85)'
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = 'rgba(255,255,255,0.12)'
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)'
              }}
            >
              Sign Out
            </button>
          </div>
        )}

        {/* ── Mobile: hamburger toggle ────────────────────── */}
        {isMobile && (
          <button
            onClick={() => setMenuOpen(o => !o)}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            style={{
              background: 'rgba(255,255,255,0.14)', border: 'none',
              width: 42, height: 42, borderRadius: 'var(--radius-md)',
              color: '#fff', fontSize: 20, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {menuOpen ? '✕' : '☰'}
          </button>
        )}
      </div>

      {/* ── Mobile: collapsible drawer with nav links + user + sign out ── */}
      {isMobile && menuOpen && (
        <div style={{
          padding: '10px 14px 18px',
          borderTop: '1px solid rgba(255,255,255,0.15)',
          display: 'flex', flexDirection: 'column', gap: 6,
        }}>
          {navItems.map(item => (
            <NavLink key={item.to} to={item.to} style={navLinkStyle} onClick={handleNavClick}>
              <img src={item.icon} alt="" style={{ width: 20, height: 20, objectFit: 'contain', flexShrink: 0 }} />
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '14px 16px 6px', marginTop: 6,
            borderTop: '1px solid rgba(255,255,255,0.15)',
          }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'rgba(255,255,255,0.18)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, fontWeight: 700, flexShrink: 0,
            }}>
              👤
            </div>
            <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700 }}>{user?.name}</div>
              <div style={{
                color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: 700,
                textTransform: 'uppercase', letterSpacing: 0.6,
              }}>
                {user?.role}
              </div>
            </div>
          </div>

          <button
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.12)', border: '1.5px solid rgba(255,255,255,0.3)',
              color: '#fff', padding: '13px 18px', marginTop: 8,
              borderRadius: 'var(--radius-md)',
              fontSize: 14, fontWeight: 700, cursor: 'pointer',
            }}
          >
            Sign Out
          </button>
        </div>
      )}
    </nav>
  )
}
