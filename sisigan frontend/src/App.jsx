// src/App.jsx - UPDATED
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import Navbar from './components/layout/Navbar'
// Add this import at the top with the others
import SalesAnalyticsDashboard from './pages/SalesAnalyticsDashboard'
import LoginPage     from './pages/LoginPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'  // NEW
import POSPage       from './pages/POSPage'
import OrdersPage    from './pages/OrdersPage'
import MenuPage      from './pages/MenuPage'
import DashboardPage from './pages/DashboardPage'
import UsersPage     from './pages/UsersPage'
import BranchesPage  from './pages/BranchesPage'
import InventoryPage from './pages/InventoryPage'
import ForecastPage from "./pages/ForecastPage";


// ── Role guard: redirect if user doesn't have required role ──
function RoleRoute({ element, roles }) {
  const { user } = useAuth()
  if (roles && !roles.includes(user?.role)) return <Navigate to="/pos" replace />
  return element
}

function ProtectedLayout() {
  const { user, loading } = useAuth()

  if (loading) return (
    <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--brown-950)' }}>
      <div style={{ color: 'var(--brown-300)', fontFamily: 'var(--font-display)', fontSize: 18 }}>🍖 Loading…</div>
    </div>
  )

  if (!user) return <Navigate to="/login" replace />

  // Default landing page per role
  const defaultRoute = '/dashboard'

  return (
    <>
      <Navbar />
      <Routes>
        <Route path="/dashboard" element={<RoleRoute element={<DashboardPage />} roles={['OWNER', 'MANAGER', 'CASHIER']} />} />
        <Route path="/pos"       element={<RoleRoute element={<POSPage />}       roles={['MANAGER', 'CASHIER']} />} />
        <Route path="/orders"    element={<OrdersPage />} />
        <Route path="/menu"      element={<RoleRoute element={<MenuPage />}      roles={['OWNER', 'MANAGER']} />} />
        <Route path="/inventory" element={<RoleRoute element={<InventoryPage />} roles={['OWNER', 'MANAGER']} />} />
        <Route path="/users"     element={<RoleRoute element={<UsersPage />}     roles={['OWNER', 'MANAGER']} />} />
        <Route path="/branches"  element={<RoleRoute element={<BranchesPage />} roles={['OWNER']} />} />
        <Route path="/forecast"  element={<RoleRoute element={<ForecastPage />} roles={['OWNER']} />} />
        <Route path="/analytics" element={<RoleRoute element={<SalesAnalyticsDashboard />} roles={['OWNER']} />} />
        <Route path="*"          element={<Navigate to={defaultRoute} replace />} />
      </Routes>
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />  {/* NEW */}
        <Route path="/*"     element={<ProtectedLayout />} />
      </Routes>
    </AuthProvider>
  )
}