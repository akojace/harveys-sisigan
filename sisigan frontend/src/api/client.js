// src/api/client.js - UPDATED
// Centralized API helper — all backend calls go through here
import {
  getCachedMenu,
  setCachedMenu,
  hasMenuChanged,
  clearMenuCache,
} from '../services/menuCacheService'

const BASE = `${import.meta.env.VITE_BACKEND_URL}/api`

async function request(path, options = {}) {
  const token = localStorage.getItem('sisigan_token')
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, { ...options, headers })
  const data = await res.json()

  if (!res.ok) {
    const validationMessage = Array.isArray(data?.errors) && data.errors.length
      ? data.errors[0]?.msg
      : ''
    throw new Error(validationMessage || data.message || `Request failed: ${res.status}`)
  }
  return data
}

// ── Auth ──────────────────────────────────────────────────
export const authApi = {
  login:                (email, password) => request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  me:                   ()                => request('/auth/me'),
  logout:               ()                => request('/auth/logout', { method: 'POST' }),
  // NEW - Password reset endpoints
  forgotPassword:       (email)           => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  verifyResetCode:      (email, code)     => request('/auth/verify-reset-code', { method: 'POST', body: JSON.stringify({ email, code }) }),
  resetPassword:        (email, code, newPassword) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),
}

// ── Menu ──────────────────────────────────────────────────
export const menuApi = {
  categories: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/menu/categories${q ? '?' + q : ''}`)
  },

  /**
   * Cache-First Menu Loader with Stale-While-Revalidate background synchronization.
   * Immediately yields local IndexedDB snapshot (0s latency even if Render is sleeping).
   * Concurrently performs background network refresh and notifies on updates.
   */
  categoriesCacheFirst: async (params = {}, { onBackgroundUpdate, onStatusChange } = {}) => {
    // 1. Immediately read from persistent local cache
    const cached = await getCachedMenu(params)
    const hasValidCache = Boolean(cached && Array.isArray(cached.data) && cached.data.length > 0)

    if (hasValidCache && onStatusChange) {
      onStatusChange({
        status: 'cached',
        timestamp: cached.timestamp,
        isBackgroundSyncing: true,
      })
    }

    // 2. Background network synchronization promise
    const networkPromise = (async () => {
      try {
        const q = new URLSearchParams(params).toString()
        const freshRes = await request(`/menu/categories${q ? '?' + q : ''}`)
        const freshData = freshRes.data || []

        // Persist to local IndexedDB storage
        await setCachedMenu(params, freshData)

        // Check if data actually changed
        const changed = !hasValidCache || hasMenuChanged(cached.data, freshData)
        if (changed && onBackgroundUpdate) {
          onBackgroundUpdate(freshData)
        }

        if (onStatusChange) {
          onStatusChange({
            status: 'synced',
            timestamp: Date.now(),
            isBackgroundSyncing: false,
            changed,
          })
        }

        return { data: freshData, fromCache: false, changed }
      } catch (err) {
        if (onStatusChange) {
          onStatusChange({
            status: hasValidCache ? 'offline' : 'error',
            isBackgroundSyncing: false,
            error: err.message,
          })
        }
        if (!hasValidCache) {
          throw err
        }
        // If we already returned cached data, continue serving it smoothly
        return { data: cached.data, fromCache: true, offline: true }
      }
    })()

    // If cache is ready, return it immediately so the UI renders without blocking!
    if (hasValidCache) {
      return {
        data: cached.data,
        fromCache: true,
        timestamp: cached.timestamp,
        networkPromise,
      }
    }

    // First-time install: wait for initial network response
    return await networkPromise
  },

  all:        ()           => request('/menu'),
  create:     async (data) => {
    const res = await request('/menu', { method: 'POST', body: JSON.stringify(data) })
    await clearMenuCache()
    return res
  },
  update:     async (id, data) => {
    const res = await request(`/menu/${id}`, { method: 'PATCH', body: JSON.stringify(data) })
    await clearMenuCache()
    return res
  },
  toggle:     async (id, data = {}) => {
    const res = await request(`/menu/${id}/toggle`, { method: 'PATCH', body: JSON.stringify(data) })
    await clearMenuCache(data.branchId)
    return res
  },
  getRecipe: (id) => request(`/menu/${id}/recipe`),
  addRecipeIngredient: async (id, data) => {
    const res = await request(`/menu/${id}/recipe`, { method: 'POST', body: JSON.stringify(data) })
    await clearMenuCache()
    return res
  },
  removeRecipeIngredient: async (id, ingId) => {
    const res = await request(`/menu/${id}/recipe/${ingId}`, { method: 'DELETE' })
    await clearMenuCache()
    return res
  },
  setRecipe: async (id, data) => {
    const res = await request(`/menu/${id}/recipe`, { method: 'PUT', body: JSON.stringify(data) })
    await clearMenuCache()
    return res
  },
  checkStock: (id, branchId) => request(`/menu/${id}/stock-check?branchId=${branchId}`),
  availability: (id, params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/menu/${id}/availability${q ? '?' + q : ''}`)
  },
  matrix: () => request('/menu/matrix'),
  clearCache: clearMenuCache,
}

// ── Branches ──────────────────────────────────────────────
export const branchesApi = {
  list:         ()         => request('/branches'),
  create:       (data)     => request('/branches',                { method: 'POST',   body: JSON.stringify(data) }),
  update:       (id, data) => request(`/branches/${id}`,          { method: 'PATCH',  body: JSON.stringify(data) }),
  toggle:       (id)       => request(`/branches/${id}/toggle`,   { method: 'PATCH' }),
  dependencies: (id)       => request(`/branches/${id}/dependencies`),
  remove:       (id, reassignOwnerToBranchId) =>
    request(
      `/branches/${id}${reassignOwnerToBranchId ? `?reassignOwnerToBranchId=${reassignOwnerToBranchId}` : ''}`,
      {
        method: 'DELETE',
        ...(reassignOwnerToBranchId ? { body: JSON.stringify({ reassignOwnerToBranchId }) } : {}),
      }
    ),
}

// ── Dashboard ─────────────────────────────────────────────
export const dashboardApi = {
  get:       (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/dashboard${q ? '?' + q : ''}`)
  },
  bestSellers: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/dashboard/best-sellers${q ? '?' + q : ''}`)
  },
  branches:  () => request('/dashboard/branches'),
  authLogs:  (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/dashboard/auth-logs${q ? '?' + q : ''}`)
  },
  // ADDED — profit ("tubo") report per menu item over a period
  profit:    (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/dashboard/profit${q ? '?' + q : ''}`)
  },
  // ADDED — ingredient recommendations from forecasted demand
  ingredientRecommendations: (items, branchId) =>
    request('/dashboard/ingredient-recommendations', {
      method: 'POST',
      body: JSON.stringify({ items, ...(branchId && { branchId }) }),
    }),
}

// ── Users ─────────────────────────────────────────────────
export const usersApi = {
  list:           ()             => request('/users'),
  create:         (data)         => request('/users',                 { method: 'POST',  body: JSON.stringify(data) }),
  update:         (id, data)     => request(`/users/${id}`,           { method: 'PATCH', body: JSON.stringify(data) }),
  resetPassword:  (id, pwd)      => request(`/users/${id}/password`,  { method: 'PATCH', body: JSON.stringify({ newPassword: pwd }) }),
  toggle:         (id)           => request(`/users/${id}/toggle`,    { method: 'PATCH' }),
}

export const ordersApi = {
  list:          (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/orders${q ? '?' + q : ''}`)
  },
  get:           (id)          => request(`/orders/${id}`),
  create:        (data)        => request('/orders',               { method: 'POST',  body: JSON.stringify(data) }),
  updateStatus:  (id, status)  => request(`/orders/${id}/status`,  { method: 'PATCH', body: JSON.stringify({ status }) }),
  cancel:        (id)          => request(`/orders/${id}`,         { method: 'DELETE' }),
  pay:           (id, data)    => request(`/orders/${id}/payment`, { method: 'POST',  body: JSON.stringify(data) }),
}

export const inventoryApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/inventory${q ? '?' + q : ''}`)
  },
  create: (data) => request('/inventory', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/inventory/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateDetails: (id, data) => request(`/inventory/${id}/details`, { method: 'PATCH', body: JSON.stringify(data) }),
  restock: (data) => request('/inventory/restock', { method: 'POST', body: JSON.stringify(data) }),
  adjust: (data) => request('/inventory/adjust', { method: 'POST', body: JSON.stringify(data) }),
  transfer: (data) => request('/inventory/transfers', { method: 'POST', body: JSON.stringify(data) }),
  transfers: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/inventory/transfers${q ? '?' + q : ''}`)
  },
  cancelTransfer: (id) => request(`/inventory/transfers/${id}/cancel`, { method: 'POST' }),
  dependencies: (id, branchId) =>
    request(`/inventory/${id}/dependencies${branchId ? `?branchId=${branchId}` : ''}`),
  remove: (id, branchId) =>
    request(`/inventory/${id}${branchId ? `?branchId=${branchId}` : ''}`, { method: 'DELETE' }),
}

export const expensesApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/expenses${q ? '?' + q : ''}`)
  },
  create: (data) => request('/expenses', { method: 'POST', body: JSON.stringify(data) }),
  delete: (id) => request(`/expenses/${id}`, { method: 'DELETE' }),
}

export const reportsApi = {
  usage: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/reports${q ? '?' + q : ''}`)
  },
}

export const notificationsApi = {
  list: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/notifications${q ? '?' + q : ''}`)
  },
  summary: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/notifications/summary${q ? '?' + q : ''}`)
  },
  markAsRead: (id) => request(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllAsRead: () => request('/notifications/read-all', { method: 'PATCH' }),
}