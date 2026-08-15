import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

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

  return (
    <nav style={{
      height: 'var(--nav-height)',
      background: 'linear-gradient(180deg,var(--brown-500),var(--brown-600))',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px', boxShadow: '0 2px 14px rgba(28,10,0,0.25)',
      position: 'sticky', top: 0, zIndex: 100,
    }}>
      {/* ── Logo section ───────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <img
          src={logo}
          alt="Harvey's Sisig Logo"
          style={{
            height: 46, width: 46, objectFit: 'cover',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
          }}
        />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.15 }}>
          <span style={{
            fontFamily: 'Georgia', color: '#fff',
            fontSize: 19, fontWeight: 700, whiteSpace: 'nowrap',
          }}>
            Harvey's Special Crispy Sisig
          </span>
          <span style={{
            display: 'inline-flex', alignSelf: 'flex-start', marginTop: 4,
            background: 'rgba(255,255,255,0.18)', color: '#fff',
            fontSize: 11, fontWeight: 700, padding: '3px 12px',
            borderRadius: 'var(--radius-full)', letterSpacing: 0.3,
          }}>
            {user?.role === 'OWNER' ? 'All Branches' : (user?.branch?.name || 'POS')}
          </span>
        </div>
      </div>

      {/* ── Nav pills ──────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'center' }}>
        {navItems.map(item => (
          <NavLink
            key={item.to}
            to={item.to}
            style={({ isActive }) => ({
              display: 'flex', alignItems: 'center', gap: 9,
              padding: '11px 20px', borderRadius: 'var(--radius-full)',
              textDecoration: 'none', fontSize: 14, fontWeight: 600,
              background: isActive ? 'rgba(255,255,255,0.22)' : 'transparent',
              color: isActive ? '#fff' : 'rgba(255,255,255,0.72)',
              boxShadow: isActive ? '0 2px 10px rgba(0,0,0,0.15)' : 'none',
              transition: 'background 220ms ease, color 220ms ease, box-shadow 220ms ease, transform 180ms ease',
              whiteSpace: 'nowrap',
            })}
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

      {/* ── Owner / sign out section ───────────────────── */}
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
    </nav>
  )
}