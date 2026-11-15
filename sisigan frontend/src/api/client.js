// src/api/client.js - UPDATED
// Centralized API helper — all backend calls go through here

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
  all:        ()           => request('/menu'),
  create:     (data)       => request('/menu',            { method: 'POST',  body: JSON.stringify(data) }),
  update:     (id, data)   => request(`/menu/${id}`,      { method: 'PATCH', body: JSON.stringify(data) }),
  toggle:     (id, data = {}) => request(`/menu/${id}/toggle`, { method: 'PATCH', body: JSON.stringify(data) }),
  getRecipe: (id) => request(`/menu/${id}/recipe`),
  addRecipeIngredient: (id, data) => request(`/menu/${id}/recipe`, { method: 'POST', body: JSON.stringify(data) }),
  removeRecipeIngredient: (id, ingId) => request(`/menu/${id}/recipe/${ingId}`, { method: 'DELETE' }),
  setRecipe: (id, data) => request(`/menu/${id}/recipe`, { method: 'PUT', body: JSON.stringify(data) }),
  checkStock: (id, branchId) => request(`/menu/${id}/stock-check?branchId=${branchId}`),
  availability: (id, params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/menu/${id}/availability${q ? '?' + q : ''}`)
  },
  matrix: () => request('/menu/matrix'),
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